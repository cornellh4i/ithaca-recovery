import type { Prisma } from "@prisma/client";

import type { IMeeting } from "../../types/models";
import { convertETToUTC, formatETDateString, getETTimeOfDay, WEEKDAY_NAMES } from "../date/timeUtils";
import { formatDayColumn } from "./recurrenceDisplay";
// recurrenceMatch, not meetingOccurrences: this module is reached from the client through
// meetingValidation.ts (hooks/useMeetingForm.ts), and meetingOccurrences' `server-only`/Prisma
// imports would break that build. The two export the same function.
import { firstOccurrenceOnOrAfter } from "./recurrenceMatch";

// A "linked schedules" family is one meeting the group runs as two co-existing weekly
// schedules -- same time, duration and interval, different modes on different weekdays -- served
// by ONE Zoom meeting (the shape the "Weekend Al-Anon 9 am" / "One Day at a Time" / "Early Bird
// Group" legacy meetings already have). The family is keyed by Meeting.linkedToMid, not by the
// shared zid: an In-Person member must never hold a zid/zoomLink, or the UI and its calendar
// events would advertise a join link for an in-person meeting and buildZoomRecurrence
// (services/zoom.ts) would union its weekdays into Zoom's schedule. zid stays the key for the
// questions it is actually about -- sharedWith/zoomScheduleDiverged, the Zoom recurrence union,
// and every teardown guard.

// Hard cap on family size. Enforced in one place so the API validator and the form's
// "Add another mode" gate can never disagree (the same reason isSharedZoomScheduleCompatible is
// shared between buildZoomRecurrence and the retrieve route).
export const LINKED_SCHEDULE_CAP = 2;

// The authoritative spelling of the three mode names -- util/rooms/modeIcons.ts keys its icon map
// by LinkedScheduleMode, and meetingValidation's Hybrid/In Person refinements compare against
// these exact strings. The order is this module's own concern: it is also the Zoom-topic segment
// order, so a family's modes always read Hybrid, then In Person, then Remote, regardless of which
// row was created first.
export const LINKED_SCHEDULE_MODES = ["Hybrid", "In Person", "Remote"] as const;

export type LinkedScheduleMode = (typeof LINKED_SCHEDULE_MODES)[number];

// Only the pattern fields formatDayColumn reads, all optional so a Prisma row, an IMeeting's
// IRecurrencePattern, and a bare { daysOfWeek } candidate all satisfy it.
export interface LinkedSchedulePattern {
  type?: string;
  weekOfMonth?: number | null;
  dayOfMonth?: number | null;
  daysOfWeek?: string[] | null;
}

// The subset of a meeting row the pure predicates below read -- deliberately structural (same
// approach as SharedZoomScheduleRow), so a Prisma row, an IMeeting, and a not-yet-created
// candidate row from a request payload all satisfy it without casting.
export interface LinkedScheduleRow {
  modeType: string;
  recurrencePattern?: LinkedSchedulePattern | null;
}

/**
 * A row {@link buildLinkedScheduleLabel} can reconcile against a family: identity plus schedule.
 * The lineage fields are optional so an in-flight request payload (which carries no
 * `splitFromMid`) still satisfies it -- see {@link isDetachedSplitChild}.
 */
export interface LinkedScheduleLabelRow extends LinkedScheduleRow {
  mid: string;
  isRecurring?: boolean | null;
  splitFromMid?: string | null;
}

/**
 * A "this occurrence" split-off child: a one-off detached from a series, not a schedule of its
 * own. It has no representation in the family's name or in Zoom's single schedule -- one
 * detached child whose mode was later edited would otherwise add a bogus segment
 * ("… - Zoom Only One-time") to every sharing row's Zoom topic and calendar title.
 *
 * Deliberately NOT applied to the family {@link getZoomScheduleFamily} returns: such a row is
 * still a real row of the shared Zoom meeting, and buildZoomRecurrence must keep seeing it to
 * decide whether Zoom's schedule can be represented at all (retrieve/meeting/[id] draws the
 * same distinction for zoomScheduleDiverged, from this same predicate).
 *
 * A recurring tail split (editScope 'thisAndFollowing') keeps `isRecurring: true` and is a
 * genuine ongoing schedule, so it is not detached.
 */
export function isDetachedSplitChild(row: { isRecurring?: boolean | null; splitFromMid?: string | null }): boolean {
  return !row.isRecurring && !!row.splitFromMid;
}

export interface LinkedFamily<TRow extends LinkedScheduleRow = LinkedScheduleRow> {
  /** The row holding `linkedToMid: null` -- every other member points at its mid. */
  anchor: TRow;
  /** The rows pointing at the anchor. Empty for the overwhelmingly common single-schedule case. */
  linked: TRow[];
}

/** A family row as {@link getLinkedFamily} loads it: the full meeting plus its pattern. */
export type LinkedFamilyMeeting = Prisma.MeetingGetPayload<{ include: { recurrencePattern: true } }>;

const FAMILY_INCLUDE = { recurrencePattern: true } as const;

/** Every member of the family, anchor first. */
export function familyMembers<TRow extends LinkedScheduleRow>(family: LinkedFamily<TRow>): TRow[] {
  return [family.anchor, ...family.linked];
}

/**
 * Loads the linked-schedule family `mid` belongs to, resolving from either member: given a
 * linked row, the anchor is followed first, so the returned family is identical whichever mid
 * the caller happens to hold. Soft-deleted rows are never members (a suspended row still is --
 * suspension is per-row and Zoom keeps the suspended member's days either way).
 *
 * Returns null when `mid` matches no live meeting. A meeting with no linked schedule at all --
 * almost every meeting -- comes back as a family of one, so callers need no special case.
 */
export async function getLinkedFamily(
  tx: Prisma.TransactionClient,
  mid: string,
): Promise<LinkedFamily<LinkedFamilyMeeting> | null> {
  // findUnique, not findFirst: mid is @unique, so "the row for this mid" is a key lookup and
  // the soft-delete filter is a property of the row found, not part of what identifies it.
  const live = async (byMid: string): Promise<LinkedFamilyMeeting | null> => {
    const found = await tx.meeting.findUnique({ where: { mid: byMid }, include: FAMILY_INCLUDE });
    return found && found.deletedAt === null ? found : null;
  };

  const row = await live(mid);
  if (!row) return null;

  // Single-level by construction: the cap of 2 means a linked row's anchor is never itself
  // linked, so there is no pointer chain to walk.
  const anchor = row.linkedToMid ? await live(row.linkedToMid) : row;
  // Anchor soft-deleted out from under a survivor whose pointer wasn't cleared: treat the
  // survivor as its own family rather than reporting no family at all, so the row stays
  // editable and its Zoom topic falls back to the single-schedule form.
  if (!anchor) return { anchor: row, linked: [] };

  const linked = await tx.meeting.findMany({
    where: { linkedToMid: anchor.mid, deletedAt: null, mid: { not: anchor.mid } },
    include: FAMILY_INCLUDE,
    orderBy: { mid: "asc" },
  });
  return { anchor, linked };
}

/**
 * Every live row the family's single Zoom meeting has to account for, ready to hand to
 * createZoomMeeting/updateZoomMeeting (services/zoom.ts).
 *
 * Two sources, unioned by mid, because neither alone is the whole picture:
 * - the linked-schedule family -- the only way to reach a Zoom-free In-Person member, which
 *   holds no zid yet still names itself in the family's Zoom topic;
 * - every other live row sharing this zid -- a scoped edit's split children (deliberately not
 *   family members) and any legacy zid group the linked backfill didn't cover. Those are real
 *   rows of the same Zoom meeting, and dropping them would narrow the union schedule Zoom
 *   currently holds (#513).
 */
export async function getZoomScheduleFamily(
  tx: Prisma.TransactionClient,
  mid: string,
  zid: string | null,
): Promise<IMeeting[]> {
  const family = await getLinkedFamily(tx, mid);
  const zidRows = zid
    ? await tx.meeting.findMany({ where: { zid, deletedAt: null }, include: FAMILY_INCLUDE })
    : [];
  const byMid = new Map<string, LinkedFamilyMeeting>();
  for (const row of [...(family ? familyMembers(family) : []), ...zidRows]) byMid.set(row.mid, row);
  // A Prisma row with its pattern included is structurally what the Zoom body builder reads,
  // just not nominally an IMeeting -- the same cast the routes already made for zid siblings.
  return [...byMid.values()] as unknown as IMeeting[];
}

/** Whether another schedule may still be added to this family (cap of {@link LINKED_SCHEDULE_CAP}). */
export function canLinkSchedule(family: LinkedFamily): boolean {
  return familyMembers(family).length < LINKED_SCHEDULE_CAP;
}

/**
 * The modes a new linked schedule may take: every mode no existing member already holds, in
 * {@link LINKED_SCHEDULE_MODES} order. Empty once the family is at the cap. Drives the form's
 * mode-button locking and the server's rejection of a duplicate mode -- one source of truth for
 * both.
 */
export function availableModesFor(family: LinkedFamily): LinkedScheduleMode[] {
  if (!canLinkSchedule(family)) return [];
  const taken = new Set(familyMembers(family).map((row) => row.modeType));
  return LINKED_SCHEDULE_MODES.filter((mode) => !taken.has(mode));
}

/**
 * Every weekday already served by some member, in week order. The family's schedules must be
 * disjoint -- Zoom holds one union recurrence, so a day claimed twice would silently collapse
 * into a single occurrence -- so these are exactly the days a new linked schedule may not use.
 */
export function claimedDaysFor(family: LinkedFamily): string[] {
  const claimed = new Set(
    familyMembers(family).flatMap((row) => row.recurrencePattern?.daysOfWeek ?? []),
  );
  const ordered = WEEKDAY_NAMES.filter((day) => claimed.has(day));
  // Anything not a recognised weekday name still has to be reported as claimed rather than
  // silently dropped, or the validator would let a second row claim it.
  return [...ordered, ...[...claimed].filter((day) => !WEEKDAY_NAMES.includes(day))];
}

/**
 * Whether this row needs the family's Zoom meeting. An In-Person member is deliberately
 * Zoom-free: it inherits no zid/zoomLink and is filtered out of the Zoom recurrence union.
 */
export function isZoomBearing(row: { modeType: string }): boolean {
  return row.modeType === "Hybrid" || row.modeType === "Remote";
}

// --- deriving a linked schedule's own series from the anchor's -----------------------------

/** The anchor fields {@link deriveLinkedScheduleStart} re-anchors a linked schedule onto. */
export interface LinkedScheduleAnchor {
  startDateTime: Date;
  endDateTime: Date;
  recurrencePattern?: { startDate: Date; endDate?: Date | null; interval: number } | null;
}

/**
 * The anchor's ET wall-clock time of day and duration, re-anchored onto the first date its
 * series actually meets on `daysOfWeek`. A linked schedule never gets its start from the client:
 * the family is served by ONE Zoom meeting, which can only hold one series, so every member has
 * to keep the same time of day and duration ({@link isSharedZoomScheduleCompatible}) -- and the
 * search runs against the ANCHOR's pattern, so an every-other-week family stays in one week phase
 * instead of the two schedules landing on alternating weeks.
 *
 * Returns null when the requested days produce no occurrence inside the anchor's series at all
 * (e.g. a series that ends first), or when the anchor carries no pattern to re-anchor onto.
 * Throws convertETToUTC's validation error when the anchor's time of day doesn't exist on the
 * derived date (the DST spring-forward gap) -- callers turn that into a 400.
 */
export function deriveLinkedScheduleStart(
  anchor: LinkedScheduleAnchor,
  daysOfWeek: string[],
): { startDateTime: Date; endDateTime: Date; patternStartDate: Date } | null {
  const pattern = anchor.recurrencePattern;
  if (!pattern) return null;
  // Never earlier than today: a schedule added to a series that started years ago is a schedule
  // that starts NOW, not one that retroactively met every week since. Searching from the series
  // start instead would publish a backdated Google Calendar series (fabricated history on past
  // calendar views) and, for a count-bounded anchor, could resolve an end date that has already
  // passed -- a row born dead. The week phase is unaffected: matchesRecurrencePattern measures
  // the interval from the ANCHOR's own startDate below, whatever date the search begins on.
  const seriesStartEtDateStr = formatETDateString(pattern.startDate);
  const todayEtDateStr = formatETDateString(new Date());
  const searchFromEtDateStr = seriesStartEtDateStr > todayEtDateStr ? seriesStartEtDateStr : todayEtDateStr;
  const firstETDate = firstOccurrenceOnOrAfter(
    {
      type: 'weekly',
      startDate: pattern.startDate,
      endDate: pattern.endDate ?? null,
      interval: pattern.interval,
      daysOfWeek,
      weekOfMonth: null,
      dayOfMonth: null,
      // The anchor's own excluded dates are its alone -- a per-occurrence deletion on the
      // Monday-Friday schedule says nothing about when the Saturday one starts.
      excludedDates: [],
    },
    searchFromEtDateStr,
  );
  if (!firstETDate) return null;
  const { hour, minute, second } = getETTimeOfDay(anchor.startDateTime);
  const pad = (value: number) => String(value).padStart(2, '0');
  const startDateTime = new Date(convertETToUTC(`${firstETDate}T${pad(hour)}:${pad(minute)}:${pad(second)}`));
  const durationMs = anchor.endDateTime.getTime() - anchor.startDateTime.getTime();
  // INVARIANT: a stored recurrencePattern.startDate is ET-midnight-anchored (parseMMDDYYYY),
  // never a real meeting-time instant -- calculateEndDateFromOccurrences reads the weekday
  // anchor straight off getUTCDay(), so a 7 PM-or-later ET start would roll into the next UTC
  // day and count the occurrences from the wrong weekday.
  const patternStartDate = new Date(convertETToUTC(`${firstETDate}T00:00:00`));
  return { startDateTime, endDateTime: new Date(startDateTime.getTime() + durationMs), patternStartDate };
}

// --- the family's display name, shared by every external service --------------------------

/**
 * The family as a service must see it for THIS write: callers load the family from the
 * database, so the row being created or updated is still its pre-edit copy in there -- the
 * in-flight version replaces it. A caller that passes only the OTHER rows still gets a
 * complete family, so no caller has to know which of the two shapes it holds.
 */
export function resolveFamilyRows<TRow extends { mid: string }>(meeting: TRow, family: TRow[]): TRow[] {
  return family.some((row) => row.mid === meeting.mid)
    ? family.map((row) => (row.mid === meeting.mid ? meeting : row))
    : [meeting, ...family];
}

// Category values that name a fellowship directly; "Other" instead reveals the free-text
// Meeting.fellowship column. Fixed order so the prefix is stable regardless of the order the
// category checkboxes were clicked in.
const FELLOWSHIP_CAL_TYPES = ["AA", "Al-Anon"] as const;

/**
 * The fellowship-prefixed base title external services display:
 * `"AA/Al-Anon Serenity Now"`. AA and Al-Anon come straight from calType; a calType of
 * "Other" contributes the custom `fellowship` text instead (nothing when it's empty). With no
 * fellowship at all the title passes through unchanged. Like {@link buildLinkedScheduleLabel},
 * the prefix uses the caller's own row, so family members' names agree only while their
 * calType/fellowship columns do.
 */
export function fellowshipPrefixedTitle(
  meeting: Pick<IMeeting, "title" | "calType" | "fellowship">,
): string {
  const calType = meeting.calType ?? [];
  const parts: string[] = FELLOWSHIP_CAL_TYPES.filter((name) => calType.includes(name));
  const custom = calType.includes("Other") ? meeting.fellowship?.trim() : "";
  if (custom) parts.push(custom);
  return parts.length ? `${parts.join("/")} ${meeting.title}` : meeting.title;
}

// How each mode names itself inside a family label. Only Remote is renamed ("Zoom Only") --
// ICR's meetings are never fully unattended, so "Remote" would read as unhosted.
export const LINKED_SCHEDULE_MODE_LABEL: Record<LinkedScheduleMode, string> = {
  Hybrid: "Hybrid",
  "In Person": "In Person",
  Remote: "Zoom Only",
};

// The Day column the exports already render ("Mon-Fri", "Sat", "Daily") -- one formatter, so a
// family's external name can never disagree with how the same schedule reads everywhere else.
function scheduleDayLabel(pattern: LinkedSchedulePattern | null | undefined): string {
  if (!pattern) return formatDayColumn(null);
  return formatDayColumn({
    type: pattern.type ?? "",
    weekOfMonth: pattern.weekOfMonth ?? null,
    dayOfMonth: pattern.dayOfMonth ?? null,
    daysOfWeek: pattern.daysOfWeek ?? [],
  });
}

/**
 * The name one meeting run as several linked schedules carries on every external service:
 * `"One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat"`. Segments follow
 * {@link LINKED_SCHEDULE_MODES}' fixed order, never the order the rows were created in, so the
 * name is stable no matter which member triggered the write.
 *
 * Pure text: no knowledge of Zoom, Google Calendar, or zid. A caller with a pinned name of its
 * own (Zoom's `zoomTopic`) short-circuits before ever reaching here.
 *
 * `singleScheduleSuffix` is the one thing the services genuinely disagree about: a lone row's
 * own mode suffix. A Google Calendar event says "In Person" on an in-person meeting; a Zoom
 * topic never does, because an in-person meeting has no Zoom meeting to name. Passing the map
 * keeps each service's established single-schedule name byte-for-byte while the family case
 * stays shared.
 *
 * `baseTitle` is the caller's own row's title, so two members' names agree only while their
 * `title` columns do. Nothing here reconciles them -- an admin may still edit a linked row's
 * title directly, which silently de-syncs the two events' names until both are rewritten.
 */
export function buildLinkedScheduleLabel(
  baseTitle: string,
  meeting: LinkedScheduleLabelRow,
  family: LinkedScheduleLabelRow[],
  singleScheduleSuffix: Record<string, string> = LINKED_SCHEDULE_MODE_LABEL,
): string {
  // Detachment is a property of the STORED row: the in-flight copy replacing it below comes
  // from a request payload that carries no lineage fields, so a detached child would otherwise
  // re-enter the label through its own edit.
  const detachedMids = new Set(family.filter(isDetachedSplitChild).map((row) => row.mid));
  const rows = resolveFamilyRows(meeting, family)
    .filter((row) => !detachedMids.has(row.mid) && !isDetachedSplitChild(row));
  const segments = LINKED_SCHEDULE_MODES.flatMap((mode) => {
    const row = rows.find((candidate) => candidate.modeType === mode);
    return row ? [`${LINKED_SCHEDULE_MODE_LABEL[mode]} ${scheduleDayLabel(row.recurrencePattern)}`.trim()] : [];
  });
  // Keyed on distinct MODES, not row count: a family's modes are unique by construction, so
  // two segments means a genuine linked family, while several rows of the same mode (a legacy
  // zid group, a recurring tail split) collapse to one segment and keep the plain
  // single-schedule name they have today. Always the row's OWN mode, even when the row was
  // filtered out above -- a detached one-off names itself, never the family it left.
  if (segments.length < 2) {
    const suffix = singleScheduleSuffix[meeting.modeType];
    return suffix ? `${baseTitle} - ${suffix}` : baseTitle;
  }
  return `${baseTitle} - ${segments.join(" - ")}`;
}

/** A shareable once-per-request family reader -- see {@link linkedFamilyLoader}. */
export type LinkedFamilyLoader = (zid: string | null) => Promise<IMeeting[]>;

/**
 * A once-per-request {@link getZoomScheduleFamily} reader. One meeting's family names both its
 * Zoom topic and every family member's Google Calendar event title in the same sync, and the
 * two must agree -- so the lookup happens at most once and every consumer reads that result.
 * The `zid` argument only matters on the first call, which is the one that runs the query.
 *
 * Caches the in-flight promise, not the resolved value: a scoped edit starts its parent and
 * child `after()` syncs concurrently, so two callers can reach an unresolved loader.
 */
export function linkedFamilyLoader(tx: Prisma.TransactionClient, mid: string): LinkedFamilyLoader {
  let loaded: Promise<IMeeting[]> | null = null;
  return (zid) => (loaded ??= getZoomScheduleFamily(tx, mid, zid));
}
