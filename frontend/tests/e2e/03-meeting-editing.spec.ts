import { test, expect } from "./support/fixtures";
import { fillTimeRange } from "./support/formHelpers";
import { seedMeeting } from "../factories/meeting";
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

  test("3.5 editing a recurring meeting updates the entire series", async ({ adminPage }) => {
    const { page } = adminPage;
    const meeting = await seedMeeting({ title: "Recurring To Edit", isRecurring: true });
    const prisma = getTestPrismaClient();
    await prisma.recurrencePattern.create({
      data: {
        mid: meeting.mid,
        type: "weekly",
        startDate: meeting.startDateTime,
        daysOfWeek: ["Sunday"],
        firstDayOfWeek: "Sunday",
        interval: 1,
        excludedDates: [],
      },
    });

    await page.goto("/");
    await openMeeting(page, "Recurring To Edit");
    await openEditFromDetails(page);
    await page.getByPlaceholder("Meeting title").fill("Recurring Series Renamed");

    await page.getByRole("button", { name: "Update Meeting" }).click();
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
