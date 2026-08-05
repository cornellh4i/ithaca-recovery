import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import BottomSheet from "../../app/components/atoms/BottomSheet";

describe("BottomSheet", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <BottomSheet isOpen={false} onClose={jest.fn()} title="Navigate to this day">
        <div>Sheet content</div>
      </BottomSheet>
    );

    expect(screen.queryByText("Sheet content")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and children when open", () => {
    render(
      <BottomSheet isOpen onClose={jest.fn()} title="Navigate to this day">
        <div>Sheet content</div>
      </BottomSheet>
    );

    expect(screen.getByRole("dialog", { name: "Navigate to this day" })).toBeInTheDocument();
    expect(screen.getByText("Sheet content")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = jest.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Filters">
        <div>Sheet content</div>
      </BottomSheet>
    );

    // BottomSheet portals to document.body, outside Testing Library's default render container.
    const backdrop = document.body.querySelector('[class*="backdrop"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = jest.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Filters">
        <div>Sheet content</div>
      </BottomSheet>
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders full-screen on a landscape phone viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 844 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 390 });

    try {
      render(
        <BottomSheet isOpen onClose={jest.fn()} title="Filters">
          <div>Sheet content</div>
        </BottomSheet>
      );

      const sheet = document.body.querySelector('[class*="sheet"]');
      expect(sheet).not.toBeNull();
      expect(sheet?.className).toMatch(/fullScreen/);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("keeps the usual bottom-anchored sheet on a portrait phone viewport", () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });

    try {
      render(
        <BottomSheet isOpen onClose={jest.fn()} title="Filters">
          <div>Sheet content</div>
        </BottomSheet>
      );

      const sheet = document.body.querySelector('[class*="sheet"]');
      expect(sheet).not.toBeNull();
      expect(sheet?.className).not.toMatch(/fullScreen/);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalHeight });
    }
  });

  it("locks body scroll while open and restores it on close", () => {
    const previousOverflow = document.body.style.overflow;
    const { rerender } = render(
      <BottomSheet isOpen onClose={jest.fn()} title="Filters">
        <div>Sheet content</div>
      </BottomSheet>
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <BottomSheet isOpen={false} onClose={jest.fn()} title="Filters">
        <div>Sheet content</div>
      </BottomSheet>
    );

    expect(document.body.style.overflow).toBe(previousOverflow);
  });
});
