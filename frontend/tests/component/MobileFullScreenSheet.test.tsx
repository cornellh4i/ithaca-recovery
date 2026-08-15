import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MobileFullScreenSheet from "../../app/components/ui/overlays/MobileFullScreenSheet";

describe("MobileFullScreenSheet", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <MobileFullScreenSheet isOpen={false} ariaLabel="New Meeting">
        <div>Form content</div>
      </MobileFullScreenSheet>
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog semantics and children when open", () => {
    render(
      <MobileFullScreenSheet isOpen ariaLabel="New Meeting">
        <div>Form content</div>
      </MobileFullScreenSheet>
    );

    const dialog = screen.getByRole("dialog", { name: "New Meeting" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Form content")).toBeInTheDocument();
  });

  it("moves focus to the first focusable element on open", () => {
    render(
      <MobileFullScreenSheet isOpen ariaLabel="New Meeting">
        <button>First field</button>
        <button>Last field</button>
      </MobileFullScreenSheet>
    );

    expect(screen.getByRole("button", { name: "First field" })).toHaveFocus();
  });

  it("traps Tab/Shift+Tab at the dialog's edges", () => {
    render(
      <MobileFullScreenSheet isOpen ariaLabel="New Meeting">
        <button>First field</button>
        <button>Last field</button>
      </MobileFullScreenSheet>
    );

    const first = screen.getByRole("button", { name: "First field" });
    const last = screen.getByRole("button", { name: "Last field" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = jest.fn();
    render(
      <MobileFullScreenSheet isOpen onClose={onClose} ariaLabel="New Meeting">
        <div>Form content</div>
      </MobileFullScreenSheet>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not throw on Escape when no onClose is provided", () => {
    render(
      <MobileFullScreenSheet isOpen ariaLabel="New Meeting">
        <div>Form content</div>
      </MobileFullScreenSheet>
    );

    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
  });

  it("restores focus to the element that was focused before opening", () => {
    const Harness: React.FC = () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <div>
          <button onClick={() => setIsOpen(true)}>Open sheet</button>
          <MobileFullScreenSheet isOpen={isOpen} onClose={() => setIsOpen(false)} ariaLabel="New Meeting">
            <button>Inside</button>
          </MobileFullScreenSheet>
        </div>
      );
    };
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open sheet" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveFocus();
  });
});
