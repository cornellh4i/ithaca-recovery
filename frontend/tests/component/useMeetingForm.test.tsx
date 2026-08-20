import { act, renderHook } from "@testing-library/react";
import { useMeetingForm } from "../../hooks/useMeetingForm";
import { IMeeting } from "../../types/models";

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
