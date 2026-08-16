import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider } from "../../app/components/shared/ToastProvider";

// uuid ships ESM-only (no CJS build as of v14) -- @swc/jest's transform doesn't cover
// node_modules by default, so importing the real module here fails to parse. Mocked rather
// than reconfiguring transformIgnorePatterns repo-wide for one test file's sake.
jest.mock("uuid", () => ({ v4: () => "test-uuid" }));

import NewMeetingSidebar, { type NewMeetingSidebarHandle } from "../../app/components/meeting-form/NewMeeting";

// ZoomHostField's useZoomHostPool fires a fetch effect on mount -- stub it the same way
// ViewMeeting.test.tsx does, since nothing here exercises a specific host list.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ hosts: [] }),
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

const renderNewMeeting = (ref: React.RefObject<NewMeetingSidebarHandle | null>, setIsNewMeetingOpen = jest.fn()) =>
  render(
    <ToastProvider>
      <NewMeetingSidebar
        ref={ref}
        setIsNewMeetingOpen={setIsNewMeetingOpen}
        triggerCalendarRefresh={jest.fn()}
        selectedDate={new Date("2026-08-20T00:00:00Z")}
        selectedView="week"
      />
    </ToastProvider>
  );

describe("NewMeetingSidebar", () => {
  // The mobile New Meeting sheet's Escape-to-close (MobileFullScreenSheet's onClose) calls
  // ref.current.requestClose() instead of a bare setIsNewMeetingOpen(false) -- see page.tsx --
  // specifically so it resets the form the same way the in-form Cancel/X button does, rather
  // than leaving stale field values visible while the sheet's exit animation plays out.
  it("requestClose (exposed via ref) resets the form before closing, same as Cancel/X", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    const setIsNewMeetingOpen = jest.fn();
    renderNewMeeting(ref, setIsNewMeetingOpen);
    // Lets ZoomHostField's own useZoomHostPool fetch effect settle before proceeding, same as
    // ViewMeeting.test.tsx's own beforeEach comment explains.
    await act(async () => {});

    const titleField = screen.getByPlaceholderText("Meeting title") as HTMLInputElement;
    fireEvent.change(titleField, { target: { value: "Serenity Group" } });
    expect(titleField.value).toBe("Serenity Group");

    // requestClose is invoked imperatively (not via a fireEvent user interaction, which RTL
    // wraps in act() automatically), so it needs its own act() to flush resetForm()'s state
    // updates before asserting on them.
    act(() => {
      ref.current?.requestClose();
    });

    expect(titleField.value).toBe("");
    expect(setIsNewMeetingOpen).toHaveBeenCalledWith(false);
  });

  it("Cancel/X and requestClose both route through the same reset behavior", async () => {
    const ref = React.createRef<NewMeetingSidebarHandle>();
    const setIsNewMeetingOpen = jest.fn();
    renderNewMeeting(ref, setIsNewMeetingOpen);
    await act(async () => {});

    const titleField = screen.getByPlaceholderText("Meeting title") as HTMLInputElement;
    fireEvent.change(titleField, { target: { value: "Serenity Group" } });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(titleField.value).toBe("");
    expect(setIsNewMeetingOpen).toHaveBeenCalledWith(false);
  });
});
