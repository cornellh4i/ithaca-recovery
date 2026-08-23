import type { Prisma } from "@prisma/client";
import {
  LINKED_SCHEDULE_CAP,
  LINKED_SCHEDULE_MODES,
  availableModesFor,
  canLinkSchedule,
  claimedDaysFor,
  familyMembers,
  getLinkedFamily,
  isZoomBearing,
  type LinkedFamily,
  type LinkedScheduleRow,
} from "../../util/meetings/linkedSchedules";

// --- getLinkedFamily's fake client -------------------------------------------------------
// A tiny in-memory stand-in for the Prisma delegate, honouring exactly the `where` keys
// getLinkedFamily uses (mid / mid: { not } / linkedToMid / deletedAt) so a member the query
// should have filtered out can't slip into a result and pass unnoticed.

type FakeRow = {
  mid: string;
  modeType: string;
  linkedToMid: string | null;
  deletedAt: Date | null;
  recurrencePattern?: { daysOfWeek: string[] } | null;
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
      findFirst: async ({ where }: { where: FakeWhere }) => rows.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: FakeWhere }) =>
        rows.filter((row) => matches(row, where)).sort((a, b) => a.mid.localeCompare(b.mid)),
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

  test("still reports a day name it doesn't recognise, rather than dropping it", () => {
    expect(claimedDaysFor(familyOf(schedule("Hybrid", ["Monday", "Funday"])))).toEqual(["Monday", "Funday"]);
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
