import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Dropdown from "../../app/components/ui/inputs/Dropdown";

const renderDropdown = (onChange = jest.fn()) => {
  render(
    <div>
      <button>Outside</button>
      <Dropdown
        label="Repeats"
        isVisible
        elements={["Never", "Daily", "Weekly"]}
        name="Select repeat"
        onChange={onChange}
      />
    </div>,
  );
  // The closed trigger's accessible name is the `name` prop until something is selected.
  return screen.getByRole("button", { name: "Select repeat" });
};

const openDropdown = (trigger: HTMLElement) => {
  // Focused first so focus restoration has a realistic starting point -- fireEvent.click alone
  // doesn't move focus in jsdom the way a real browser click on a button does.
  trigger.focus();
  fireEvent.click(trigger);
};

describe("Dropdown", () => {
  it("opens on the trigger and closes again on a second click", () => {
    const trigger = renderDropdown();
    openDropdown(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves focus to the first option on open and back to the trigger on close", () => {
    const trigger = renderDropdown();
    openDropdown(trigger);
    expect(screen.getByRole("option", { name: "Never" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape", () => {
    const trigger = renderDropdown();
    openDropdown(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on an outside click", () => {
    const trigger = renderDropdown();
    openDropdown(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("stays open on a click inside its own list", () => {
    const trigger = renderDropdown();
    openDropdown(trigger);
    fireEvent.mouseDown(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("selects an option, closes, and returns focus to the trigger", () => {
    const onChange = jest.fn();
    const trigger = renderDropdown(onChange);
    openDropdown(trigger);

    fireEvent.click(screen.getByRole("option", { name: "Weekly" }));
    expect(onChange).toHaveBeenCalledWith("Weekly");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("selects an option on Enter", () => {
    const onChange = jest.fn();
    const trigger = renderDropdown(onChange);
    openDropdown(trigger);

    fireEvent.keyDown(screen.getByRole("option", { name: "Daily" }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("Daily");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
