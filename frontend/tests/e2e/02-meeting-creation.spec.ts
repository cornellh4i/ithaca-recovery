import { test, expect } from "./support/fixtures";
import { fillDatePicker, fillTimeRange, selectFromDropdown, toggleCalType, todayMMDDYYYY } from "./support/formHelpers";
import { getTestPrismaClient } from "../factories/db";
import { seedMeeting } from "../factories/meeting";

// Manual script §2 (Meeting Creation). §2.7 (Zoom Room creation) lives in
// 06-zoom-integration.spec.ts, which owns all Zoom-specific assertions.

test.describe("meeting creation", () => {
  test("2.2 fill out and submit the form; the meeting appears on the calendar", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await expect(page.getByRole("heading", { name: "New Meeting" })).toBeVisible();

    await page.getByPlaceholder("Meeting title").fill("Full Flow Meeting");
    await page.getByRole("button", { name: "In Person", exact: true }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("creation@test.icr");

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Meeting created successfully")).toBeVisible();

    // Sidebar closes back to the filter/new-meeting view.
    await expect(page.getByText("New Meeting")).toBeVisible();
    await expect(page.getByText("Full Flow Meeting")).toBeVisible();
  });

  test("2.3 missing title blocks submission with a validation banner", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();

    await page.getByRole("button", { name: "In Person", exact: true }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("noname@test.icr");

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Fix 1 field before saving")).toBeVisible();
    await expect(page.getByText("Meeting title is required.")).toBeVisible();

    // Form is still open — nothing was submitted.
    await expect(page.getByRole("heading", { name: "New Meeting" })).toBeVisible();

    // The banner's live count decrements as the field is fixed, then disappears once
    // every validation rule is satisfied.
    await page.getByPlaceholder("Meeting title").fill("Now Has A Title");
    await expect(page.getByText("Fix 1 field before saving")).toHaveCount(0);
  });

  test("2.4 checking multiple Meeting Types saves both categories", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();

    await page.getByPlaceholder("Meeting title").fill("Dual Category Meeting");
    await page.getByRole("button", { name: "In Person", exact: true }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "20:00", "21:00");
    await selectFromDropdown(page, "Select Room", "Unity Room");
    await toggleCalType(page, "AA");
    await toggleCalType(page, "Other");
    await page.getByPlaceholder("Email").fill("dual@test.icr");

    const writeResponse = page.waitForResponse((r) => r.url().includes("/api/write/meeting"));
    await page.getByRole("button", { name: "Create Meeting" }).click();
    await writeResponse;

    const prisma = getTestPrismaClient();
    const created = await prisma.meeting.findFirst({ where: { title: "Dual Category Meeting" } });
    expect(created?.calType.sort()).toEqual(["AA", "Other"]);
  });

  test("2.5 double-booking a room/time already taken is blocked by a conflict modal, which can be overridden", async ({ adminPage }) => {
    const { page } = adminPage;
    const existing = await seedMeeting({ title: "Already Booked", room: "Seeds of Hope Room" });

    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Conflicting Meeting");
    await page.getByRole("button", { name: "In Person", exact: true }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Seeds of Hope Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("conflict@test.icr");

    await page.getByRole("button", { name: "Create Meeting" }).click();

    // Blocked by the room conflict -- the override modal appears instead of the normal
    // success toast, naming the meeting it collides with. Scoped to the dialog and exact-
    // matched -- the seeded meeting's own calendar box (still visible behind the overlay) and
    // the modal's own message text both otherwise also match "Already Booked" un-scoped.
    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Scheduling conflict")).toBeVisible();
    await expect(modal.getByText(existing.title, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save anyway" }).click();
    await expect(page.getByText("Meeting created successfully")).toBeVisible();

    const prisma = getTestPrismaClient();
    const room = await prisma.meeting.findMany({ where: { room: "Seeds of Hope Room" } });
    expect(room.map((m) => m.title)).toEqual(expect.arrayContaining([existing.title, "Conflicting Meeting"]));
  });

  test("2.6 canceling out of the conflict modal leaves the meeting unsaved", async ({ adminPage }) => {
    const { page } = adminPage;
    await seedMeeting({ title: "Already Booked", room: "Seeds of Hope Room" });

    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Unsaved Conflicting Meeting");
    await page.getByRole("button", { name: "In Person", exact: true }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await fillTimeRange(page, "18:00", "19:00");
    await selectFromDropdown(page, "Select Room", "Seeds of Hope Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("conflict2@test.icr");

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Scheduling conflict")).toBeVisible();

    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page.getByText("Scheduling conflict")).not.toBeVisible();

    const prisma = getTestPrismaClient();
    const created = await prisma.meeting.findFirst({ where: { title: "Unsaved Conflicting Meeting" } });
    expect(created).toBeNull();
  });

  // An end time *earlier* than the start is a valid overnight meeting (buildMeetingPayload
  // rolls the end onto the next day); an end identical to the start is the one case that
  // silently becomes a 24-hour meeting, so it's the one the form rejects.
  test("2.8 an end time identical to the start blocks submission, an overnight range doesn't", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();

    await page.getByPlaceholder("Meeting title").fill("Zero Length Meeting");
    await page.getByRole("button", { name: "In Person" }).click();
    await fillDatePicker(page, todayMMDDYYYY());
    await selectFromDropdown(page, "Select Room", "Serenity Room");
    await toggleCalType(page, "AA");
    await page.getByPlaceholder("Email").fill("zerolength@test.icr");

    await fillTimeRange(page, "18:00", "18:00");
    await expect(page.getByText(/End time must differ from the start time/)).toBeVisible();

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Fix 1 field before saving")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New Meeting" })).toBeVisible();

    // An overnight range clears the error and is accepted.
    await fillTimeRange(page, "23:00", "01:00");
    await expect(page.getByText(/End time must differ from the start time/)).toHaveCount(0);
    await expect(page.getByText("Ends the next day.")).toBeVisible();

    await page.getByRole("button", { name: "Create Meeting" }).click();
    await expect(page.getByText("Meeting created successfully")).toBeVisible();
  });

  test("2.9 closing the form with unsaved changes asks before discarding", async ({ adminPage }) => {
    const { page } = adminPage;
    await page.goto("/");
    await page.getByText("New Meeting").click();
    await page.getByPlaceholder("Meeting title").fill("Half Filled Meeting");

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Discard unsaved changes?")).toBeVisible();

    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByPlaceholder("Meeting title")).toHaveValue("Half Filled Meeting");

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("heading", { name: "New Meeting" })).toHaveCount(0);
  });
});
