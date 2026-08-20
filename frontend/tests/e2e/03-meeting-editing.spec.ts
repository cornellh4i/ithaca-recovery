import { test, expect } from "./support/fixtures";
import { fillTimeRange } from "./support/formHelpers";
import { seedMeeting, seedRecurringMeeting } from "../factories/meeting";
import { getTestPrismaClient } from "../factories/db";
import { convertETToUTC, formatETDateString } from "../../util/date/timeUtils";

// Avoids overlapping the default 18:00-19:00 seeded slot, which Day view can't visually split.
function laterSlot() {
  const etDate = formatETDateString(new Date());
  return {
    startDateTime: new Date(convertETToUTC(`${etDate}T20:00:00`)),
    endDateTime: new Date(convertETToUTC(`${etDate}T21:00:00`)),
  };
}

// Manual script §3 (Meeting Editing). §3.5/3.6 (Zoom-room mode switches) live in
// 06-zoom-integration.spec.ts.

async function openMeeting(page: import("@playwright/test").Page, title: string) {
  await page.getByText(title, { exact: true }).click();
}

async function openEditFromDetails(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Meeting options" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
}

test.describe("meeting editing", () => {
  test("3.3 clicking a meeting opens its details panel with correct info", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Detail Panel Meeting", email: "detail@test.icr" });
    await page.goto("/");
    await openMeeting(page, "Detail Panel Meeting");

    // Level 1 disambiguates ViewMeeting's <h1> from the calendar card's <h3>.
    await expect(page.getByRole("heading", { level: 1, name: "Detail Panel Meeting" })).toBeVisible();
    await expect(page.getByText("detail@test.icr")).toBeVisible();
  });

  test("3.4 editing title/date/time persists across a reload", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Editable Meeting" });
    await page.goto("/");
    await openMeeting(page, "Editable Meeting");
    await openEditFromDetails(page);

    await expect(page.getByRole("heading", { name: "Edit Meeting" })).toBeVisible();
    const titleInput = page.getByPlaceholder("Meeting title");
    await expect(titleInput).toHaveValue("Editable Meeting");

    await titleInput.fill("Renamed Meeting");
    await fillTimeRange(page, "20:00", "21:00");

    await page.getByRole("button", { name: "Update Meeting" }).click();
    await expect(page.getByText("Meeting updated successfully")).toBeVisible();

    await page.reload();
    const prisma = getTestPrismaClient();
    const updated = await prisma.meeting.findFirst({ where: { title: "Renamed Meeting" } });
    expect(updated).not.toBeNull();
  });

  test("3.5 editing a recurring meeting opens the edit-recurring dialog", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedRecurringMeeting({ title: "Recurring To Edit" });
    await page.goto("/");
    await openMeeting(page, "Recurring To Edit");
    await openEditFromDetails(page);
    await page.getByPlaceholder("Meeting title").fill("Recurring Series Renamed");
    await page.getByRole("button", { name: "Update Meeting" }).click();

    await expect(page.getByLabel("This event")).toBeVisible();
    await expect(page.getByLabel("This and following events")).toBeVisible();
    await expect(page.getByLabel("All events")).toBeVisible();
  });

  test("3.5a 'All events' updates the entire series", async ({ adminPage }) => {
    const { page } = adminPage;
    const { meeting } = await seedRecurringMeeting({ title: "Recurring To Edit All" });
    const prisma = getTestPrismaClient();

    await page.goto("/");
    await openMeeting(page, "Recurring To Edit All");
    await openEditFromDetails(page);
    await page.getByPlaceholder("Meeting title").fill("Recurring Series Renamed");
    await page.getByRole("button", { name: "Update Meeting" }).click();
    await page.getByLabel("All events").check();

    const updateResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await updateResponse;

    // The calendar (level-3 heading) picks up the rename immediately via the
    // post-update refresh; the still-open detail panel's own <h1> is a known
    // exception — it keeps showing the pre-edit title until closed and reopened,
    // since onUpdateSuccess only invalidates the calendar's cache, not the
    // currently-selected meeting itself.
    await expect(page.getByRole("heading", { level: 3, name: "Recurring Series Renamed" })).toBeVisible();

    // Only one Meeting document backs the whole series — there's no per-occurrence copy.
    const all = await prisma.meeting.findMany({ where: { mid: meeting.mid } });
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Recurring Series Renamed");
  });

  test("3.5b 'This event' detaches the clicked occurrence, series keeps other dates", async ({ adminPage }) => {
    const { page } = adminPage;
    // seedRecurringMeeting's bare default leaves daysOfWeek empty, which matchesRecurrencePattern
    // (util/meetings/recurrenceMatch.ts) treats as "matches no date at all" -- not even the
    // meeting's own start date. A scope 'this'/'thisAndFollowing' save validates occurrenceDate
    // against that real pattern server-side, so (same as 3.5c below) the day actually clicked
    // needs to be one the pattern genuinely recurs on.
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
    const { meeting } = await seedRecurringMeeting(
      { title: "Recurring To Edit This" },
      { type: "weekly", daysOfWeek: [dayName], interval: 1 },
    );
    const prisma = getTestPrismaClient();

    await page.goto("/");
    await openMeeting(page, "Recurring To Edit This");
    await openEditFromDetails(page);
    await page.getByPlaceholder("Meeting title").fill("Occurrence Renamed");
    await page.getByRole("button", { name: "Update Meeting" }).click();
    await page.getByLabel("This event").check();

    const updateResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await updateResponse;
    await expect(page.getByText("Meeting updated successfully")).toBeVisible();

    // The series row itself is untouched -- same pattern 04-meeting-deletion.spec.ts's 4.3
    // asserts for "This event" deletion, mirrored here for an edit.
    const series = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    expect(series?.title).toBe("Recurring To Edit This");
    const pattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
    expect(pattern?.excludedDates.length).toBeGreaterThan(0);

    // The clicked occurrence becomes its own standalone (non-recurring) meeting.
    const standalone = await prisma.meeting.findFirst({ where: { title: "Occurrence Renamed" } });
    expect(standalone).not.toBeNull();
    expect(standalone?.isRecurring).toBe(false);

    await page.reload();
    await expect(page.getByText("Occurrence Renamed")).toBeVisible();
    await expect(page.getByText("Recurring To Edit This")).toHaveCount(0);
  });

  test("3.5c 'This and following events' splits the series at the clicked date", async ({ adminPage }) => {
    const { page } = adminPage;
    const dayName = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
    const { meeting } = await seedRecurringMeeting(
      { title: "Recurring To Split" },
      { type: "weekly", daysOfWeek: [dayName], interval: 1 },
    );
    const prisma = getTestPrismaClient();

    await page.goto("/");
    await openMeeting(page, "Recurring To Split");
    await openEditFromDetails(page);
    await page.getByPlaceholder("Meeting title").fill("Split Series Renamed");
    await page.getByRole("button", { name: "Update Meeting" }).click();
    await page.getByLabel("This and following events").check();

    const updateResponse = page.waitForResponse((r) => r.url().includes("/api/update/meeting"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await updateResponse;
    await expect(page.getByText("Meeting updated successfully")).toBeVisible();

    // The original series keeps its old title, now bounded to end before the split date.
    const original = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });
    expect(original?.title).toBe("Recurring To Split");
    const originalPattern = await prisma.recurrencePattern.findUnique({ where: { mid: meeting.mid } });
    expect(originalPattern?.endDate).not.toBeNull();

    // A new tail series picks up the rename from the split date onward.
    const tail = await prisma.meeting.findFirst({ where: { title: "Split Series Renamed" } });
    expect(tail).not.toBeNull();
    expect(tail?.isRecurring).toBe(true);

    await page.reload();
    await expect(page.getByText("Split Series Renamed")).toBeVisible();
  });

  test("3.6 opening a different meeting closes an in-progress edit panel", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Edit Panel A" });
    await seedMeeting({ title: "Edit Panel B", ...laterSlot() });
    await page.goto("/");

    await openMeeting(page, "Edit Panel A");
    await openEditFromDetails(page);
    await expect(page.getByRole("heading", { name: "Edit Meeting" })).toBeVisible();

    // level: 3 disambiguates the calendar card from ViewMeeting's <h1>.
    await page.getByRole("heading", { name: "Edit Panel B", exact: true, level: 3 }).click();

    await expect(page.getByRole("heading", { name: "Edit Meeting" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Edit Panel B" })).toBeVisible();
  });

  test("3.7 opening a different meeting doesn't carry over a stale sync-error banner", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Sync Error Meeting", googleSyncStatus: "error" });
    await seedMeeting({ title: "Synced Meeting", ...laterSlot() });
    await page.goto("/");

    await openMeeting(page, "Sync Error Meeting");
    await expect(page.locator("span", { hasText: /^Failed to sync$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry sync" })).toBeVisible();

    await page.getByRole("heading", { name: "Synced Meeting", exact: true, level: 3 }).click();

    await expect(page.getByText("Failed to sync")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry sync" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Synced Meeting" })).toBeVisible();
  });
});
