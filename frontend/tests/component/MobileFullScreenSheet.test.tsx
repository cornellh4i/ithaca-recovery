import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MobileFullScreenSheet from "../../app/components/ui/overlays/MobileFullScreenSheet";
import Modal from "../../app/components/ui/overlays/Modal";

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

  // A Modal (e.g. ConflictOverrideModal) can open on top of this sheet (e.g. New Meeting),
  // opened later from a user action after the sheet is already up -- not simultaneously, which
  // matters here: both portal to document.body as siblings, not ancestor/descendant, and both
  // register their own Escape listener on `document` via the same useDialogBehavior hook, whose
  // "topmost dialog" tracking is ordered by when each one's open-effect actually ran. A single
  // Escape press must close only the nested modal, not this sheet (and the in-progress form).
  it("does not close when Escape is pressed while a nested Modal is open on top of it", () => {
    const onSheetClose = jest.fn();
    const onModalClose = jest.fn();
    const Harness: React.FC = () => {
      const [modalOpen, setModalOpen] = React.useState(false);
      return (
        <MobileFullScreenSheet isOpen onClose={onSheetClose} ariaLabel="New Meeting">
          <button onClick={() => setModalOpen(true)}>Trigger conflict</button>
          <Modal isOpen={modalOpen} onClose={onModalClose} ariaLabel="Conflict">
            <button>Override</button>
          </Modal>
        </MobileFullScreenSheet>
      );
    };
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Trigger conflict" }));
    expect(screen.getByRole("dialog", { name: "Conflict" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onSheetClose).not.toHaveBeenCalled();
  });
});
