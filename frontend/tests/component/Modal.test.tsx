import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Modal from "../../app/components/ui/overlays/Modal";

const Dialog: React.FC<{ isOpen: boolean; onClose: () => void; preventClose?: boolean }> = ({
  isOpen,
  onClose,
  preventClose,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} labelledBy="dialog-title" preventClose={preventClose}>
    <h2 id="dialog-title">Dialog title</h2>
    <button>First</button>
    <button>Last</button>
  </Modal>
);

// Wraps Dialog with a real trigger button so open/close is driven by user interaction --
// needed to exercise Modal's focus-restoration-to-previously-focused-element behavior, which
// only makes sense relative to a real "what was focused before this opened" starting point.
const Harness: React.FC<{ preventClose?: boolean }> = ({ preventClose }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open dialog</button>
      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} preventClose={preventClose} />
    </div>
  );
};

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Dialog isOpen={false} onClose={jest.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog semantics when open", () => {
    render(<Dialog isOpen onClose={jest.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Dialog title");
  });

  it("falls back to ariaLabel when no labelledBy element exists", () => {
    render(
      <Modal isOpen onClose={jest.fn()} ariaLabel="Fallback label">
        <button>Only button</button>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Fallback label");
  });

  it("moves focus to the first focusable element on open", () => {
    render(<Dialog isOpen onClose={jest.fn()} />);
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
  });

  it("traps Tab/Shift+Tab at the dialog's edges", () => {
    render(<Dialog isOpen onClose={jest.fn()} />);
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("calls onClose on Escape", () => {
    const onClose = jest.fn();
    render(<Dialog isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape or overlay click when preventClose is set", () => {
    const onClose = jest.fn();
    const { container } = render(<Dialog isOpen onClose={onClose} preventClose />);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(container.ownerDocument.body.querySelector("div")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on a genuine overlay backdrop click, not a click inside the content", () => {
    const onClose = jest.fn();
    render(<Dialog isOpen onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole("dialog")); // click inside content -- should not close
    expect(onClose).not.toHaveBeenCalled();

    const overlay = screen.getByRole("dialog").parentElement!;
    fireEvent.mouseDown(overlay, { target: overlay });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the element that was focused before opening", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveFocus();
  });
});
