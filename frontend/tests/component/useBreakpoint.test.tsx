import React from "react";
import { render } from "@testing-library/react";
import { act } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import {
  SIDEBAR_EXPAND_BREAKPOINT,
  SIDEBAR_YIELD_BREAKPOINT,
} from "../../util/common/breakpoints";

function Harness({ collapse, expand }: { collapse: () => void; expand: () => void }) {
  useBreakpoint(collapse, expand);
  return null;
}

const originalWidth = window.innerWidth;

function setWidth(value: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value });
}

function resizeTo(value: number) {
  act(() => {
    setWidth(value);
    window.dispatchEvent(new Event("resize"));
  });
}

afterEach(() => {
  setWidth(originalWidth);
});

test("collapses on mount when the full sidebar and week no longer fit", () => {
  const collapse = jest.fn();
  const expand = jest.fn();
  setWidth(SIDEBAR_YIELD_BREAKPOINT - 100);
  render(<Harness collapse={collapse} expand={expand} />);
  expect(collapse).toHaveBeenCalledTimes(1);
  expect(expand).not.toHaveBeenCalled();
});

test("collapses once on crossing the yield edge downward, not on every narrower resize", () => {
  const collapse = jest.fn();
  const expand = jest.fn();
  setWidth(SIDEBAR_EXPAND_BREAKPOINT + 200);
  render(<Harness collapse={collapse} expand={expand} />);
  expect(collapse).not.toHaveBeenCalled();

  resizeTo(SIDEBAR_YIELD_BREAKPOINT - 1);
  expect(collapse).toHaveBeenCalledTimes(1);

  resizeTo(SIDEBAR_YIELD_BREAKPOINT - 200);
  resizeTo(SIDEBAR_YIELD_BREAKPOINT - 400);
  expect(collapse).toHaveBeenCalledTimes(1);
});

test("re-expands only past the higher expand edge (hysteresis), so the band between edges never fights a manual toggle", () => {
  const collapse = jest.fn();
  const expand = jest.fn();
  setWidth(SIDEBAR_YIELD_BREAKPOINT - 100);
  render(<Harness collapse={collapse} expand={expand} />);
  expect(collapse).toHaveBeenCalledTimes(1);

  // Widening into the dead band does nothing in either direction.
  resizeTo(SIDEBAR_YIELD_BREAKPOINT + 10);
  expect(expand).not.toHaveBeenCalled();
  expect(collapse).toHaveBeenCalledTimes(1);

  // Only crossing the expand edge re-expands.
  resizeTo(SIDEBAR_EXPAND_BREAKPOINT + 1);
  expect(expand).toHaveBeenCalledTimes(1);

  // Narrowing back into the dead band does not re-collapse.
  resizeTo(SIDEBAR_EXPAND_BREAKPOINT - 10);
  expect(collapse).toHaveBeenCalledTimes(1);

  // Crossing the yield edge does.
  resizeTo(SIDEBAR_YIELD_BREAKPOINT - 1);
  expect(collapse).toHaveBeenCalledTimes(2);
});
