import "@testing-library/jest-dom";

// jsdom has no ResizeObserver -- stubbed here (not per-test) since any component tree that
// happens to mount TagList.tsx (or anything else that measures itself) needs this globally
// available, not just the specific test that intentionally exercises it.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error -- test-only stub, not a spec-complete ResizeObserver
  window.ResizeObserver = ResizeObserverStub;
}
