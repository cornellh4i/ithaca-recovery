import "@testing-library/jest-dom";

// jsdom doesn't implement ResizeObserver -- TagList (and anything else measuring its own
// layout, e.g. BoxText's zoomTag width) needs a stub or it throws on mount.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
