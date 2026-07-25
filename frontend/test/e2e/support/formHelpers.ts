import type { Page } from "@playwright/test";

// Fills the sidebar meeting form's DatePicker (a plain text input, placeholder
// "MM/DD/YYYY") and blurs it. DatePicker.tsx reformats on blur into "Month Day,
// Year" and that's what ends up in form state — filling MM/DD/YYYY and blurring
// once is the real user flow (typing or picking a day in the popup calendar both
// funnel through the same reformat-on-commit codepath).
export async function fillDatePicker(page: Page, mmddyyyy: string): Promise<void> {
  const input = page.getByPlaceholder("MM/DD/YYYY");
  await input.fill(mmddyyyy);
  await input.blur();
}

// Fills the two native `<input type="time">` fields (start, end) — they have no
// distinguishing attributes, so they're addressed by position.
export async function fillTimeRange(page: Page, startHHMM: string, endHHMM: string): Promise<void> {
  const timeInputs = page.locator('input[type="time"]');
  await timeInputs.nth(0).fill(startHHMM);
  await timeInputs.nth(1).fill(endHHMM);
}

// Opens one of the atoms/Dropdown.tsx menus by its placeholder button text
// (`name` prop, e.g. "Select Room") and clicks the target option.
export async function selectFromDropdown(page: Page, buttonName: string, optionText: string): Promise<void> {
  // Not `exact` — Dropdown.tsx's button has a CSS-generated "▼" suffix appended
  // to its accessible name.
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByRole("listitem").filter({ hasText: optionText }).click();
}

// Toggles one of the AA/Al-Anon/Other checkboxes, scoped to the meeting form's
// own checkbox group (data-testid="meeting-type-checkboxes") — the same label
// text also appears as tag chips on calendar meeting cards behind the sidebar.
export async function toggleCalType(page: Page, type: string): Promise<void> {
  await page.getByTestId("meeting-type-checkboxes").getByText(type, { exact: true }).click();
}

// Toggles a MeetingsFilter checkbox by its visible label, scoped to the sidebar's
// filter panel — Day view also renders a same-named <h3> room-column header on the
// calendar itself (e.g. "Unity Room" is both a filter label and a room header), so
// an unscoped text match is ambiguous there. Room names are also reused verbatim as
// Zoom Room filter labels (MeetingsFilter.tsx's ZOOM_ITEMS), so within the panel
// itself `.first()` picks the Location group's checkbox -- it always renders before
// the Zoom Rooms group -- matching what every current caller actually intends.
export async function toggleFilter(page: Page, label: string): Promise<void> {
  await page.locator('[class*="meetingsFilter"]').getByText(label, { exact: true }).first().click();
}

// Switches the CalendarNavbar Day/Week view via its atoms/Dropdown.tsx view-switcher.
// Scoped to the navbar's own dropdown wrapper (not the meeting form's Dropdown
// instances) so the button can be clicked without knowing which view is currently
// selected -- unlike selectFromDropdown's callers, this button's accessible name
// changes with the current view instead of staying a fixed placeholder.
export async function selectView(page: Page, view: "Day" | "Week"): Promise<void> {
  const dropdown = page.locator('[class*="viewDropdown"]');
  await dropdown.getByRole("button").click();
  await dropdown.getByRole("listitem").filter({ hasText: view }).click();
}

// Today's date in MM/DD/YYYY, for form fixtures that need to land on a real day
// the calendar view will actually render (avoids hardcoded dates going stale).
// Anchored to ET (not the test runner's local system clock) -- the app's "today" is
// always the ET calendar date, and the runner's own local date disagrees with it for
// several hours every night (e.g. GitHub Actions runners are UTC, which is already
// "tomorrow" for the ~4-5 hours after UTC midnight while it's still "today" in ET).
export function todayMMDDYYYY(): string {
  const [year, month, day] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    .split("-");
  return `${month}/${day}/${year}`;
}
