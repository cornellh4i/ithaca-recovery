import React from "react";
import { render, screen, act } from "@testing-library/react";
import { usePopupPosition } from "../../hooks/usePopupPosition";

// Minimal harness -- renders the popup div itself (not just asserting on hook return values in
// isolation) so the useLayoutEffect post-mount height correction actually gets to run against a
// real (if jsdom-fake) DOM node, the same way ViewMeeting's own popup does.
const Harness: React.FC<{ anchorEl: HTMLElement | null }> = ({ anchorEl }) => {
  const { popupRef, popupPosition } = usePopupPosition(anchorEl);
  if (!popupPosition) return null;
  return (
    <div
      ref={popupRef}
      data-testid="popup"
      style={{ position: "fixed", top: popupPosition.top, left: popupPosition.left }}
    />
  );
};

// Builds an anchor element whose getBoundingClientRect always reflects the current `rect`
// (a mutable closure, not a fixed jest.fn() return sequence) -- usePopupPosition's own effects
// call getBoundingClientRect multiple times per render pass (once on mount, again from the
// post-mount useLayoutEffect correction), so a queued one-shot mock would desync from which
// call site consumes which value.
const makeAnchor = (rect: Partial<DOMRect>): { el: HTMLElement; setRect: (r: Partial<DOMRect>) => void } => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let current = rect;
  el.getBoundingClientRect = jest.fn(() => current as DOMRect);
  return { el, setRect: (r) => { current = r; } };
};

describe("usePopupPosition", () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
  });

  it("renders nothing when there is no anchor element", () => {
    render(<Harness anchorEl={null} />);
    expect(screen.queryByTestId("popup")).not.toBeInTheDocument();
  });

  it("anchors to the right of the anchor element when there is room", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const { el } = makeAnchor({ top: 100, left: 50, right: 150, bottom: 140 });

    render(<Harness anchorEl={el} />);

    const popup = screen.getByTestId("popup");
    expect(popup.style.left).toBe("162px"); // rect.right (150) + ANCHOR_GAP (12)
    expect(popup.style.top).toBe("100px");
  });

  it("flips to the left of the anchor element when the right side would overflow", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const { el } = makeAnchor({ top: 100, left: 400, right: 450, bottom: 140 });

    render(<Harness anchorEl={el} />);

    const popup = screen.getByTestId("popup");
    // rect.left (400) - POPUP_WIDTH (380) - ANCHOR_GAP (12) = 8 -- already inside the margin
    // clamp's bounds here (this case doesn't actually exercise the clamp; it's a coincidence
    // of the numbers chosen that the flipped value already equals POPUP_MARGIN).
    expect(popup.style.left).toBe("8px");
  });

  it("clamps top against the popup's real (post-mount) height so it never renders below the viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    // jsdom never lays anything out, so offsetHeight is always 0 by default -- without this
    // stub, the clamp below would pass regardless of whether the clamping math is actually
    // correct (0 is trivially small enough to fit almost anywhere), which is exactly what made
    // the previous version of this test not a real check. Stubbed on the prototype (not the
    // specific popup node) because the corrected calculation reads offsetHeight from
    // popupRef.current inside a useLayoutEffect that runs right after this element mounts --
    // there's no render-time hook to attach a per-instance stub to first.
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 400 });

    try {
      // An anchor positioned below the (short) viewport entirely.
      const { el } = makeAnchor({ top: 550, left: 50, right: 150, bottom: 590 });

      render(<Harness anchorEl={el} />);

      // top = clamp(rect.top, POPUP_MARGIN, innerHeight - popupHeight - POPUP_MARGIN)
      //     = clamp(550, 8, 600 - 400 - 8) = 192
      expect(screen.getByTestId("popup").style.top).toBe("192px");
    } finally {
      if (originalOffsetHeight) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
      }
    }
  });

  it("recomputes position on window resize", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const { el, setRect } = makeAnchor({ top: 100, left: 50, right: 150, bottom: 140 });

    render(<Harness anchorEl={el} />);
    expect(screen.getByTestId("popup").style.top).toBe("100px");

    setRect({ top: 200, left: 60, right: 160, bottom: 240 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByTestId("popup").style.top).toBe("200px");
  });
});
