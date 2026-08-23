import { test, expect } from "./support/fixtures";
import { fillDatePicker, fillTimeRange, selectFromDropdown, selectView, toggleCalType } from "./support/formHelpers";
import { getTestPrismaClient } from "../factories/db";

// One meeting run as two linked schedules -- a different mode on other weekdays, served by the
// family's single Zoom meeting (util/meetings/linkedSchedules.ts). The test env has no Zoom
// credentials (see support/sync-fixtures.ts), so nothing here asserts a real join link; what
// matters end-to-end is that one form submit writes both rows as one family and that the form
// then shows the second schedule and stops offering a third.

const TITLE = "Linked Modes Meeting";

// The ET calendar date `days` days from today, as MM/DD/YYYY -- the app's "today" is always the
// ET date, which the runner's own local date disagrees with for several hours every night.
function etDateIn(days: number): { mmddyyyy: string; weekday: string } {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const [year, month, day] = date.toLocaleDateString("en-CA", { timeZone: "America/New_York" }).split("-");
  const weekday = date.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
  return { mmddyyyy: `${month}/${day}/${year}`, weekday };
}

test.describe("linked meeting modes", () => {
  test("20.1 adds a second mode's schedule to a new meeting in one submit", async ({ adminPage }) => {
    const { page } = adminPage;
    // Two different weekdays, derived from today so neither goes stale: the meeting's own
    // schedule takes tomorrow's weekday, its linked schedule the day after's.
    const primaryDay = etDateIn(1);
    const linkedDay = etDateIn(2);

    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill(TITLE);
    await page.getByRole("button", { name: "Hybrid", exact: true }).click();
    await fillDatePicker(page, primaryDay.mmddyyyy);
    await fillTimeRange(page, "09:00", "10:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("linked@test.icr");

    // The recurrence editor seeds the meeting's own weekday from the Date field above.
    await page.getByText("This meeting is recurring", { exact: true }).click();
    await expect(page.getByRole("button", { name: primaryDay.weekday })).toHaveAttribute("aria-pressed", "true");

    // One click: this meeting's schedule collapses into a card and the second one opens below it.
    await page.getByRole("button", { name: /Add another mode for other days/ }).click();

    const draft = page.getByTestId("linked-schedule-draft");
    // Hybrid is the meeting's own mode, so the linked schedule can't take it; its own weekday
    // is locked out too -- the two schedules must never share a day.
    await expect(draft.getByRole("button", { name: /Hybrid/ })).toBeDisabled();
    await expect(draft.getByRole("button", { name: primaryDay.weekday })).toBeDisabled();

    await draft.getByRole("button", { name: /Remote/ }).click();
    await draft.getByRole("button", { name: linkedDay.weekday }).click();

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Meeting created successfully")).toBeVisible();

    const prisma = getTestPrismaClient();
    const rows = await prisma.meeting.findMany({
      where: { title: TITLE },
      include: { recurrencePattern: true },
      orderBy: { modeType: "asc" },
    });
    expect(rows).toHaveLength(2);
    const [hybrid, remote] = rows;
    expect(hybrid.modeType).toBe("Hybrid");
    expect(remote.modeType).toBe("Remote");
    // The family is keyed by linkedToMid, not by the shared zid -- the anchor holds none.
    expect(hybrid.linkedToMid).toBeNull();
    expect(remote.linkedToMid).toBe(hybrid.mid);
    expect(hybrid.recurrencePattern?.daysOfWeek).toEqual([primaryDay.weekday]);
    expect(remote.recurrencePattern?.daysOfWeek).toEqual([linkedDay.weekday]);
    // Derived from the anchor, never sent by the form.
    expect(remote.recurrencePattern?.interval).toBe(hybrid.recurrencePattern?.interval);
    expect(remote.startDateTime.toISOString().slice(11)).toBe(hybrid.startDateTime.toISOString().slice(11));

    // Both schedules are ordinary rows on the calendar, each on its own day. Next week rather
    // than this one: it's the first week that contains a future occurrence of both, whatever
    // weekday the run happens to land on.
    await selectView(page, "Week");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(TITLE).first()).toBeVisible();
    expect(await page.getByText(TITLE).count()).toBeGreaterThanOrEqual(2);

    // Reopening the meeting shows the schedule it now runs alongside -- and offers no third.
    await page.goto(`/?mid=${hybrid.mid}&edit=1`);
    const linkedSection = page.getByRole("region", { name: "Linked schedule" });
    await expect(linkedSection.getByText("Remote")).toBeVisible();
    await expect(page.getByRole("button", { name: /Add another mode for other days/ })).toHaveCount(0);
  });
});
