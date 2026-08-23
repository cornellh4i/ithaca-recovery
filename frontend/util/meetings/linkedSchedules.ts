import type { Prisma } from "@prisma/client";

import { WEEKDAY_NAMES } from "../date/timeUtils";

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

// Fixed order, also the Zoom-topic segment order: a family's modes always read Hybrid, then
// In Person, then Remote, regardless of which row was created first.
export const LINKED_SCHEDULE_MODES = ["Hybrid", "In Person", "Remote"] as const;

export type LinkedScheduleMode = (typeof LINKED_SCHEDULE_MODES)[number];

// The subset of a meeting row the pure predicates below read -- deliberately structural (same
// approach as SharedZoomScheduleRow), so a Prisma row, an IMeeting, and a not-yet-created
// candidate row from a request payload all satisfy it without casting.
export interface LinkedScheduleRow {
  modeType: string;
  recurrencePattern?: { daysOfWeek?: string[] | null } | null;
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

/** Whether another schedule may still be added to this family (cap of {@link LINKED_SCHEDULE_CAP}). */
export function canLinkSchedule(family: LinkedFamily): boolean {
  return familyMembers(family).length < LINKED_SCHEDULE_CAP;
}

/**
 * The modes a new linked schedule may take: every mode no existing member already holds, in
 * {@link LINKED_SCHEDULE_MODES} order. Empty once the family is at the cap. Drives the form's
 * mode-button locking, the superset of Room / Zoom Room / Zoom Host fields it mounts, and the
 * server's rejection of a duplicate mode -- one source of truth for all three.
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
