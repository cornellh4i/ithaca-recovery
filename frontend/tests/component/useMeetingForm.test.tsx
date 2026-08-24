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

// A draft can only be started on a weekly series, but the meeting's own recurrence stays editable
// underneath it -- and a linked schedule has no representation outside a weekly union.
describe("useMeetingForm linked draft against a non-weekly recurrence", () => {
  const weeklyPattern: IRecurrencePattern = {
    mid: "m-1",
    type: "weekly",
    startDate: new Date("2026-07-05T00:00:00.000Z"),
    daysOfWeek: ["Sunday"],
    firstDayOfWeek: "Sunday",
    interval: 1,
    excludedDates: [],
  };
  const weeklyMeeting: IMeeting = { ...baseMeeting, isRecurring: true, recurrencePattern: weeklyPattern };

  const startDraft = (result: { current: ReturnType<typeof useMeetingForm> }) => {
    act(() => result.current.handleRecurringMeetingChange({ isRecurring: true, recurrencePattern: weeklyPattern }));
    act(() => result.current.startLinkedDraft("Remote"));
    act(() => result.current.setIsLinkedDraftConfirmed(true));
  };

  it("drops the draft and says so when the meeting switches to monthly", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);

    act(() => result.current.handleRecurringMeetingChange({
      isRecurring: true,
      recurrencePattern: { ...weeklyPattern, type: "monthly", dayOfMonth: 5, daysOfWeek: [] },
    }));

    expect(result.current.linkedDraft).toBeNull();
    expect(result.current.isLinkedDraftConfirmed).toBe(false);
    expect(result.current.linkedDraftDiscardedNote).toBe(true);
  });

  it("drops the draft when recurrence is turned off entirely", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);

    act(() => result.current.handleRecurringMeetingChange({ isRecurring: false, recurrencePattern: null }));

    expect(result.current.linkedDraft).toBeNull();
    expect(result.current.linkedDraftDiscardedNote).toBe(true);
  });

  // The meeting's own schedule collapsed only to make room for the second one; left collapsed, its
  // summary card would describe a recurrence the meeting no longer has.
  it("reopens the meeting's own schedule editor after an auto-discard", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);
    expect(result.current.isScheduleConfirmed).toBe(true);

    act(() => result.current.handleRecurringMeetingChange({ isRecurring: false, recurrencePattern: null }));

    expect(result.current.isScheduleConfirmed).toBe(false);
  });

  // RecurringMeetingForm reports on mount, before any draft can exist -- a notice then would be an
  // unprompted warning about a schedule nobody asked for.
  it("raises no notice for a non-weekly report while there is no draft", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => result.current.handleRecurringMeetingChange({ isRecurring: false, recurrencePattern: null }));

    expect(result.current.linkedDraftDiscardedNote).toBe(false);
  });

  // The "Add another mode" trigger comes back with the weekly pattern, so a notice still saying
  // the schedule was dropped for not repeating weekly would contradict the control beside it.
  it("clears the notice when the meeting goes back to repeating weekly", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);

    act(() => result.current.handleRecurringMeetingChange({
      isRecurring: true,
      recurrencePattern: { ...weeklyPattern, type: "monthly", dayOfMonth: 5, daysOfWeek: [] },
    }));
    expect(result.current.linkedDraftDiscardedNote).toBe(true);

    act(() => result.current.handleRecurringMeetingChange({ isRecurring: true, recurrencePattern: weeklyPattern }));
    expect(result.current.linkedDraftDiscardedNote).toBe(false);
  });

  it("clears the notice once a new draft is started", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);
    act(() => result.current.handleRecurringMeetingChange({ isRecurring: false, recurrencePattern: null }));

    act(() => result.current.handleRecurringMeetingChange({ isRecurring: true, recurrencePattern: weeklyPattern }));
    act(() => result.current.startLinkedDraft("Remote"));

    expect(result.current.linkedDraftDiscardedNote).toBe(false);
    expect(result.current.linkedDraft).not.toBeNull();
  });

  // Cancelling is the admin's own doing, so there is nothing to explain.
  it("raises no notice on an explicit discard", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);

    act(() => result.current.discardLinkedDraft());

    expect(result.current.linkedDraft).toBeNull();
    expect(result.current.isLinkedDraftConfirmed).toBe(false);
    expect(result.current.linkedDraftDiscardedNote).toBe(false);
  });

  // NewMeeting reuses one mounted form for the next meeting, so anything left here would show up
  // on a meeting that never had a linked schedule.
  it("clears the confirmed flag and the notice on resetForm", () => {
    const { result } = renderHook(() => useMeetingForm(weeklyMeeting));
    startDraft(result);
    act(() => result.current.handleRecurringMeetingChange({ isRecurring: false, recurrencePattern: null }));
    expect(result.current.linkedDraftDiscardedNote).toBe(true);

    act(() => result.current.resetForm());

    expect(result.current.linkedDraft).toBeNull();
    expect(result.current.isLinkedDraftConfirmed).toBe(false);
    expect(result.current.linkedDraftDiscardedNote).toBe(false);
    expect(result.current.isScheduleConfirmed).toBe(false);
  });
});

describe("useMeetingForm fellowship field", () => {
  it("submits trimmed fellowship only while Other is checked", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => {
      result.current.handleCalTypeToggle("Other");
      result.current.setFellowship("  NA  ");
    });
    expect(result.current.buildMeetingPayload("m-1", "Active")?.fellowship).toBe("NA");

    // Unchecking Other nulls the payload value even though the typed text is kept in state,
    // so a ghost prefix can't linger on external titles.
    act(() => result.current.handleCalTypeToggle("Other"));
    expect(result.current.buildMeetingPayload("m-1", "Active")?.fellowship).toBeNull();
    expect(result.current.fellowship).toBe("  NA  ");
  });

  it("empty fellowship submits null and stays optional (no validation error)", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => result.current.handleCalTypeToggle("Other"));
    expect(result.current.buildMeetingPayload("m-1", "Active")?.fellowship).toBeNull();
    expect(result.current.getValidationErrors()).toEqual([]);
  });

  it("editing fellowship marks the form dirty; resetForm clears it", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setFellowship("NA"));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.resetForm());
    expect(result.current.fellowship).toBe("");
  });

  it("seeds fellowship from the stored meeting", () => {
    const { result } = renderHook(() => useMeetingForm({ ...baseMeeting, calType: ["Other"], fellowship: "NA" }));
    expect(result.current.fellowship).toBe("NA");
    expect(result.current.buildMeetingPayload("m-1", "Active")?.fellowship).toBe("NA");
  });
});

describe("useMeetingForm advanced Zoom settings", () => {
  it("defaults: no custom passcode, scheduled (not meet-anytime), join-before-host on", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    const payload = result.current.buildMeetingPayload("m-1", "Active");
    expect(payload?.zoomCustomPasscode).toBeNull();
    expect(payload?.zoomMeetAnytime).toBe(false);
    expect(payload?.zoomJoinBeforeHost).toBe(true);
  });

  it("submits the trimmed passcode and the toggles as set", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => {
      result.current.setZoomCustomPasscode(" abc123 ");
      result.current.setZoomMeetAnytime(true);
      result.current.setZoomJoinBeforeHost(false);
    });
    const payload = result.current.buildMeetingPayload("m-1", "Active");
    expect(payload?.zoomCustomPasscode).toBe("abc123");
    expect(payload?.zoomMeetAnytime).toBe(true);
    expect(payload?.zoomJoinBeforeHost).toBe(false);
  });

  it("rejects a passcode outside Zoom's constraints, mirroring the server rule", () => {
    const { result } = renderHook(() => useMeetingForm(baseMeeting));
    act(() => result.current.setZoomCustomPasscode("way-too-long-passcode"));
    expect(result.current.getValidationErrors().some((e) => e.fields.includes("zoomCustomPasscode"))).toBe(true);
    act(() => result.current.setZoomCustomPasscode("abc 123"));
    expect(result.current.getValidationErrors().some((e) => e.fields.includes("zoomCustomPasscode"))).toBe(true);
    act(() => result.current.setZoomCustomPasscode("abc-123"));
    expect(result.current.getValidationErrors().some((e) => e.fields.includes("zoomCustomPasscode"))).toBe(false);
  });

  it("editing any advanced setting marks the form dirty; seeds from the stored meeting", () => {
    const seeded = { ...baseMeeting, zoomCustomPasscode: "pw1", zoomMeetAnytime: true, zoomJoinBeforeHost: false };
    const { result } = renderHook(() => useMeetingForm(seeded));
    expect(result.current.zoomCustomPasscode).toBe("pw1");
    expect(result.current.zoomMeetAnytime).toBe(true);
    expect(result.current.zoomJoinBeforeHost).toBe(false);
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setZoomJoinBeforeHost(true));
    expect(result.current.isDirty).toBe(true);
  });
});
