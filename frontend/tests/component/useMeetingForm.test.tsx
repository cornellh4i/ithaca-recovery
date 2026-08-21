import { act, renderHook } from "@testing-library/react";
import { useMeetingForm } from "../../hooks/useMeetingForm";
import { IMeeting, IRecurrencePattern } from "../../types/models";

// Covers isModeDirty/isHostDirty directly against the hook rather than through
// EditMeeting's real Zoom Host dropdown (which needs a fetch-mocked host pool just to
// select anything) -- the business rule under test is purely the dirty-comparison logic
// EditRecurringModal's disableScopedEdits gate reads, not the dropdown UI itself.
const baseMeeting: IMeeting = {
  mid: "m-1",
  title: "Recurring Series",
  description: "",
  creator: "Creator",
  group: "Group",
  startDateTime: new Date("2026-07-05T22:00:00.000Z"),
  endDateTime: new Date("2026-07-05T23:00:00.000Z"),
  email: "seed@test.icr",
  calType: ["AA"],
  modeType: "In Person",
  room: "Serenity Room",
  zoomHost: "Host1@Test.ICR",
  status: "Active",
  isRecurring: false,
};

describe("useMeetingForm mode/host dirty tracking", () => {
  it("isModeDirty is false until Mode is changed from the seeded meeting", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    expect(result.current.isModeDirty).toBe(false);

    act(() => result.current.handleModeSelect("Remote"));
    expect(result.current.isModeDirty).toBe(true);

    act(() => result.current.handleModeSelect("In Person"));
    expect(result.current.isModeDirty).toBe(false);
  });

  it("isHostDirty is false when the same host is resubmitted in a different casing", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    expect(result.current.isHostDirty).toBe(false);

    act(() => result.current.setZoomHost("host1@test.icr"));
    expect(result.current.isHostDirty).toBe(false);

    act(() => result.current.setZoomHost("HOST1@TEST.ICR"));
    expect(result.current.isHostDirty).toBe(false);
  });

  it("isHostDirty is true for a genuinely different host", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => result.current.setZoomHost("host2@test.icr"));
    expect(result.current.isHostDirty).toBe(true);
  });

  it("isHostDirty is false when the host is cleared back to blank/automatic", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => result.current.setZoomHost(""));
    expect(result.current.isHostDirty).toBe(false);
  });
});

describe("useMeetingForm date/recurrence dirty independence", () => {
  const seededPattern: IRecurrencePattern = {
    mid: "m-1",
    type: "weekly",
    startDate: new Date("2026-07-05T00:00:00.000Z"),
    daysOfWeek: ["Sunday"],
    firstDayOfWeek: "Sunday",
    interval: 1,
    excludedDates: [],
  };
  const recurringMeeting: IMeeting = {
    ...baseMeeting,
    isRecurring: true,
    recurrencePattern: seededPattern,
  };

  // RecurringMeeting.tsx rebuilds recurrencePattern.startDate from this hook's own `date` field
  // on every Date-field edit (its main effect depends on the `startDate` prop) -- regression
  // for isRecurrenceDirty spuriously tripping (and disabling EditRecurringModal's 'this' option
  // too) whenever only the Date field changed, even though isDateDirty already covers that case
  // on its own (disabling only 'thisAndFollowing').
  it("editing only the Date field doesn't trip isRecurrenceDirty", async () => {
    const { result } = renderHook(() => useMeetingForm(recurringMeeting));
    // RecurringMeetingForm's real mount-time report, matching the seeded pattern.
    act(() => result.current.handleRecurringMeetingChange({ isRecurring: true, recurrencePattern: seededPattern }));
    // Lets the settling window (a real setTimeout(0)) close before treating this as the baseline.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(result.current.isRecurrenceDirty).toBe(false);

    act(() => result.current.setDate("09/01/2026"));
    // RecurringMeetingForm's real effect would now re-report with a shifted startDate but
    // otherwise-identical settings -- simulated directly here.
    act(() => result.current.handleRecurringMeetingChange({
      isRecurring: true,
      recurrencePattern: { ...seededPattern, startDate: new Date("2026-09-01T00:00:00.000Z") },
    }));

    expect(result.current.isDateDirty).toBe(true);
    expect(result.current.isRecurrenceDirty).toBe(false);
  });

  it("still flags a genuine recurrence-settings change, independent of any Date edit", async () => {
    const { result } = renderHook(() => useMeetingForm(recurringMeeting));
    act(() => result.current.handleRecurringMeetingChange({ isRecurring: true, recurrencePattern: seededPattern }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });

    act(() => result.current.handleRecurringMeetingChange({
      isRecurring: true,
      recurrencePattern: { ...seededPattern, daysOfWeek: ["Monday"] },
    }));

    expect(result.current.isDateDirty).toBe(false);
    expect(result.current.isRecurrenceDirty).toBe(true);
  });
});
