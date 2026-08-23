import type { Prisma } from "@prisma/client";
import {
  LINKED_SCHEDULE_CAP,
  LINKED_SCHEDULE_MODES,
  availableModesFor,
  buildLinkedScheduleLabel,
  canLinkSchedule,
  claimedDaysFor,
  familyMembers,
  getLinkedFamily,
  isDetachedSplitChild,
  isZoomBearing,
  resolveFamilyRows,
  type LinkedFamily,
  type LinkedScheduleLabelRow,
  type LinkedScheduleRow,
} from "../../util/meetings/linkedSchedules";

// --- getLinkedFamily's fake client -------------------------------------------------------
// A tiny in-memory stand-in for the Prisma delegate, honouring exactly the `where` keys
// getLinkedFamily uses (mid / mid: { not } / linkedToMid / deletedAt) so a member the query
// should have filtered out can't slip into a result and pass unnoticed. findUnique ignores
// deletedAt exactly like the real key lookup does -- the caller filters soft-deleted rows.

type FakeRow = {
  mid: string;
  modeType: string;
  linkedToMid: string | null;
  deletedAt: Date | null;
  recurrencePattern?: { daysOfWeek: string[] | null } | null;
};

type FakeWhere = {
  mid?: string | { not: string };
  linkedToMid?: string;
  deletedAt?: null;
};

const matches = (row: FakeRow, where: FakeWhere): boolean => {
  if (where.deletedAt === null && row.deletedAt !== null) return false;
  if (typeof where.mid === "string" && row.mid !== where.mid) return false;
  if (where.mid && typeof where.mid === "object" && row.mid === where.mid.not) return false;
  if (where.linkedToMid !== undefined && row.linkedToMid !== where.linkedToMid) return false;
  return true;
};

const fakeClient = (rows: FakeRow[]) =>
  ({
    meeting: {
      findUnique: async ({ where }: { where: { mid: string } }) =>
        rows.find((row) => row.mid === where.mid) ?? null,
      findMany: async ({ where, orderBy }: { where: FakeWhere; orderBy?: { mid: "asc" | "desc" } }) => {
        const found = rows.filter((row) => matches(row, where));
        return orderBy?.mid === "asc" ? [...found].sort((a, b) => a.mid.localeCompare(b.mid)) : found;
      },
    },
  }) as unknown as Prisma.TransactionClient;

const row = (mid: string, over: Partial<FakeRow> = {}): FakeRow => ({
  mid,
  modeType: "Hybrid",
  linkedToMid: null,
  deletedAt: null,
  recurrencePattern: null,
  ...over,
});

describe("getLinkedFamily", () => {
  test("a meeting with no linked schedule is a family of one", async () => {
    const family = await getLinkedFamily(fakeClient([row("solo")]), "solo");
    expect(family?.anchor.mid).toBe("solo");
    expect(family?.linked).toEqual([]);
  });

  test("resolves the same family from either member", async () => {
    const rows = [row("anchor"), row("second", { linkedToMid: "anchor", modeType: "Remote" })];
    const fromAnchor = await getLinkedFamily(fakeClient(rows), "anchor");
    const fromLinked = await getLinkedFamily(fakeClient(rows), "second");

    expect(fromAnchor?.anchor.mid).toBe("anchor");
    expect(fromAnchor?.linked.map((m) => m.mid)).toEqual(["second"]);
    expect(fromLinked?.anchor.mid).toBe(fromAnchor?.anchor.mid);
    expect(fromLinked?.linked.map((m) => m.mid)).toEqual(fromAnchor?.linked.map((m) => m.mid));
  });

  test("returns null when the mid matches no live meeting", async () => {
    expect(await getLinkedFamily(fakeClient([row("solo")]), "missing")).toBeNull();
    expect(await getLinkedFamily(fakeClient([row("gone", { deletedAt: new Date() })]), "gone")).toBeNull();
  });

  test("excludes a soft-deleted linked schedule from the family", async () => {
    const rows = [row("anchor"), row("removed", { linkedToMid: "anchor", deletedAt: new Date() })];
    const family = await getLinkedFamily(fakeClient(rows), "anchor");
    expect(family?.linked).toEqual([]);
  });

  test("a survivor still pointing at a soft-deleted anchor becomes its own family", async () => {
    const rows = [row("anchor", { deletedAt: new Date() }), row("survivor", { linkedToMid: "anchor" })];
    const family = await getLinkedFamily(fakeClient(rows), "survivor");
    expect(family?.anchor.mid).toBe("survivor");
    expect(family?.linked).toEqual([]);
  });

  test("returns linked members ordered by mid, not in storage order", async () => {
    // Defensive beyond today's cap of 2: the Zoom topic's segment order is derived from this
    // list, so it has to be deterministic no matter what order the rows come back in.
    const rows = [
      row("anchor"),
      row("zulu", { linkedToMid: "anchor" }),
      row("alpha", { linkedToMid: "anchor" }),
    ];
    const family = await getLinkedFamily(fakeClient(rows), "anchor");
    expect(family?.linked.map((m) => m.mid)).toEqual(["alpha", "zulu"]);
  });

  test("the anchor never appears in its own linked list", async () => {
    // Defensive: a row pointing at itself would otherwise be counted twice, pushing a family of
    // one over the cap.
    const family = await getLinkedFamily(fakeClient([row("self", { linkedToMid: "self" })]), "self");
    expect(familyMembers(family!).map((m) => m.mid)).toEqual(["self"]);
  });
});

// --- pure predicates ---------------------------------------------------------------------

const familyOf = (...members: LinkedScheduleRow[]): LinkedFamily => ({
  anchor: members[0],
  linked: members.slice(1),
});

const schedule = (modeType: string, daysOfWeek?: string[]): LinkedScheduleRow => ({
  modeType,
  recurrencePattern: daysOfWeek ? { daysOfWeek } : null,
});

describe("canLinkSchedule", () => {
  test("true while the family is below the cap", () => {
    expect(canLinkSchedule(familyOf(schedule("Hybrid")))).toBe(true);
  });

  test("false once the family holds the capped number of schedules", () => {
    expect(canLinkSchedule(familyOf(schedule("Hybrid"), schedule("Remote")))).toBe(false);
    expect(LINKED_SCHEDULE_CAP).toBe(2);
  });
});

describe("availableModesFor", () => {
  test("offers every mode no member already holds", () => {
    expect(availableModesFor(familyOf(schedule("Hybrid")))).toEqual(["In Person", "Remote"]);
    expect(availableModesFor(familyOf(schedule("Remote")))).toEqual(["Hybrid", "In Person"]);
  });

  test("returns modes in the fixed Hybrid / In Person / Remote order", () => {
    expect(LINKED_SCHEDULE_MODES).toEqual(["Hybrid", "In Person", "Remote"]);
    expect(availableModesFor(familyOf(schedule("Nonsense")))).toEqual([...LINKED_SCHEDULE_MODES]);
  });

  test("offers nothing once the family is at the cap", () => {
    expect(availableModesFor(familyOf(schedule("Hybrid"), schedule("Remote")))).toEqual([]);
  });
});

describe("claimedDaysFor", () => {
  test("unions every member's weekdays in week order", () => {
    const family = familyOf(
      schedule("Hybrid", ["Monday", "Friday"]),
      schedule("Remote", ["Saturday", "Sunday"]),
    );
    expect(claimedDaysFor(family)).toEqual(["Sunday", "Monday", "Friday", "Saturday"]);
  });

  test("de-duplicates a day both schedules claim", () => {
    const family = familyOf(schedule("Hybrid", ["Monday"]), schedule("Remote", ["Monday", "Tuesday"]));
    expect(claimedDaysFor(family)).toEqual(["Monday", "Tuesday"]);
  });

  test("claims nothing for a member with no recurrence pattern", () => {
    expect(claimedDaysFor(familyOf(schedule("Hybrid")))).toEqual([]);
  });

  test("claims nothing for a pattern whose daysOfWeek is null", () => {
    const family = familyOf(
      { modeType: "Hybrid", recurrencePattern: { daysOfWeek: null } },
      schedule("Remote", ["Tuesday"]),
    );
    expect(claimedDaysFor(family)).toEqual(["Tuesday"]);
  });

  test("still reports a day name it doesn't recognise, rather than dropping it", () => {
    expect(claimedDaysFor(familyOf(schedule("Hybrid", ["Monday", "Funday"])))).toEqual(["Monday", "Funday"]);
  });
});

// --- the shared family label -------------------------------------------------------------

const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const labelRow = (mid: string, modeType: string, daysOfWeek?: string[]): LinkedScheduleLabelRow => ({
  mid,
  modeType,
  recurrencePattern: daysOfWeek ? { type: "weekly", daysOfWeek } : null,
});

describe("resolveFamilyRows", () => {
  test("replaces the family's stored copy of the row being written with the in-flight one", () => {
    const stored = labelRow("m-1", "Hybrid", ["Monday"]);
    const inFlight = labelRow("m-1", "Hybrid", ["Monday", "Tuesday"]);
    const sibling = labelRow("m-2", "Remote", ["Saturday"]);

    expect(resolveFamilyRows(inFlight, [stored, sibling])).toEqual([inFlight, sibling]);
  });

  test("adds the row when the caller passed only its siblings", () => {
    const inFlight = labelRow("m-1", "Hybrid", ["Monday"]);
    const sibling = labelRow("m-2", "Remote", ["Saturday"]);

    expect(resolveFamilyRows(inFlight, [sibling])).toEqual([inFlight, sibling]);
  });

  test("treats an empty family as a family of one", () => {
    const inFlight = labelRow("m-1", "Hybrid", ["Monday"]);
    expect(resolveFamilyRows(inFlight, [])).toEqual([inFlight]);
  });
});

describe("buildLinkedScheduleLabel", () => {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  test("names each mode with its own days, in the fixed mode order", () => {
    const hybrid = labelRow("m-hybrid", "Hybrid", weekdays);
    const remote = labelRow("m-remote", "Remote", ["Saturday"]);
    const expected = "One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat";

    // Same name from either member, and regardless of how the family came back from the
    // database -- nothing about it may depend on which row triggered the write.
    expect(buildLinkedScheduleLabel("One Day at a Time", hybrid, [hybrid, remote])).toBe(expected);
    expect(buildLinkedScheduleLabel("One Day at a Time", remote, [remote, hybrid])).toBe(expected);
  });

  test("names an In-Person member, which holds no Zoom identity of its own", () => {
    const inPerson = labelRow("m-inperson", "In Person", ["Saturday"]);
    const remote = labelRow("m-remote", "Remote", ["Sunday"]);

    expect(buildLinkedScheduleLabel("Weekend Al-Anon", remote, [inPerson, remote]))
      .toBe("Weekend Al-Anon - In Person Sat - Zoom Only Sun");
  });

  test("collapses a member meeting every day to 'Daily', like every other schedule display", () => {
    const hybrid = labelRow("m-hybrid", "Hybrid", [...WEEK]);
    const inPerson = labelRow("m-inperson", "In Person", ["Saturday"]);

    expect(buildLinkedScheduleLabel("Early Bird Group", hybrid, [hybrid, inPerson]))
      .toBe("Early Bird Group - Hybrid Daily - In Person Sat");
  });

  test("falls back to the lone-meeting suffix below two distinct modes", () => {
    const hybrid = labelRow("m-hybrid", "Hybrid", weekdays);
    // Several rows of one mode -- a scoped edit's split children, a legacy zid group -- are not
    // a linked family, and must keep the plain name they have today.
    const splitChild = labelRow("m-split", "Hybrid", weekdays);

    expect(buildLinkedScheduleLabel("Early Bird Group", hybrid, [hybrid, splitChild]))
      .toBe("Early Bird Group - Hybrid");
    // No family supplied at all is the same case -- the row names only itself.
    expect(buildLinkedScheduleLabel("Early Bird Group", hybrid, [])).toBe("Early Bird Group - Hybrid");
  });

  test("takes the lone-meeting suffix from the caller, which is the one thing the services differ on", () => {
    const inPerson = labelRow("m-1", "In Person", ["Monday"]);

    // A calendar event says so; a Zoom topic can't, since an in-person meeting has no Zoom
    // meeting to name -- so Zoom passes a map without it.
    expect(buildLinkedScheduleLabel("Early Bird Group", inPerson, [inPerson]))
      .toBe("Early Bird Group - In Person");
    expect(buildLinkedScheduleLabel("Early Bird Group", inPerson, [inPerson], { Hybrid: "Hybrid", Remote: "Zoom Only" }))
      .toBe("Early Bird Group");
  });

  test("names a family member with no recurrence pattern at all rather than dropping it", () => {
    const hybrid = labelRow("m-hybrid", "Hybrid", weekdays);
    const oneTime = labelRow("m-remote", "Remote");

    expect(buildLinkedScheduleLabel("Early Bird Group", hybrid, [hybrid, oneTime]))
      .toBe("Early Bird Group - Hybrid Mon-Fri - Zoom Only One-time");
  });

  test("never names a detached split child, whatever mode it was later given", () => {
    const hybrid = { ...labelRow("m-hybrid", "Hybrid", weekdays), isRecurring: true };
    // A "this occurrence" split-off that was afterwards edited to a different mode: it shares
    // the zid, so it reaches the family, but it is a one-off, not a schedule of its own.
    const detached = { ...labelRow("m-split", "Remote"), isRecurring: false, splitFromMid: "m-hybrid" };

    expect(buildLinkedScheduleLabel("One Day at a Time", hybrid, [hybrid, detached]))
      .toBe("One Day at a Time - Hybrid");
    // Its own edit names only itself too -- the in-flight payload carries no lineage fields, so
    // the exclusion has to come from the stored copy in the family.
    expect(buildLinkedScheduleLabel("One Day at a Time", labelRow("m-split", "Remote"), [hybrid, detached]))
      .toBe("One Day at a Time - Zoom Only");
  });

  test("still names a recurring tail split, which is a genuine ongoing schedule", () => {
    const hybrid = { ...labelRow("m-hybrid", "Hybrid", weekdays), isRecurring: true };
    const tail = { ...labelRow("m-tail", "Remote", ["Saturday"]), isRecurring: true, splitFromMid: "m-hybrid" };

    expect(buildLinkedScheduleLabel("One Day at a Time", hybrid, [hybrid, tail]))
      .toBe("One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat");
  });
});

describe("isDetachedSplitChild", () => {
  test("only a non-recurring row split off a parent is detached", () => {
    expect(isDetachedSplitChild({ isRecurring: false, splitFromMid: "m-parent" })).toBe(true);
    expect(isDetachedSplitChild({ isRecurring: true, splitFromMid: "m-parent" })).toBe(false);
    expect(isDetachedSplitChild({ isRecurring: false, splitFromMid: null })).toBe(false);
    expect(isDetachedSplitChild({ isRecurring: true })).toBe(false);
  });
});

describe("isZoomBearing", () => {
  test("Hybrid and Remote rows need the family's Zoom meeting", () => {
    expect(isZoomBearing({ modeType: "Hybrid" })).toBe(true);
    expect(isZoomBearing({ modeType: "Remote" })).toBe(true);
  });

  test("an In Person row never holds the family's Zoom identity", () => {
    expect(isZoomBearing({ modeType: "In Person" })).toBe(false);
  });

  test("an unrecognised mode is treated as Zoom-free", () => {
    expect(isZoomBearing({ modeType: "" })).toBe(false);
  });
});
