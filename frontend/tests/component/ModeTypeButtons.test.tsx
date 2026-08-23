import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ModeTypeButtons from "../../app/components/ui/inputs/ModeTypeButtons";

describe("ModeTypeButtons", () => {
  it.each([
    ["Hybrid", "co-present"],
    ["In Person", "location"],
    ["Remote", "video-call"],
  ])("prefixes the %s button with its mode icon", (mode, expectedIconName) => {
    render(<ModeTypeButtons selectedMode={mode} onModeSelect={jest.fn()} />);

    const button = screen.getByRole("button", { name: new RegExp(mode) });
    // firstElementChild, not a descendant querySelector -- asserts the icon actually prefixes
    // the label (matching this test's own name), not just that one exists somewhere inside.
    expect(button.firstElementChild).toHaveAttribute("data-icon-name", expectedIconName);
  });

  it("leaves every mode selectable when none is disabled", () => {
    render(<ModeTypeButtons selectedMode="Hybrid" onModeSelect={jest.fn()} />);

    for (const mode of ["Hybrid", "In Person", "Remote"]) {
      expect(screen.getByRole("button", { name: new RegExp(mode) })).toBeEnabled();
    }
  });

  it("disables the listed modes and refuses to select them", () => {
    const onModeSelect = jest.fn();
    render(<ModeTypeButtons selectedMode="Remote" onModeSelect={onModeSelect} disabledModes={["Hybrid"]} />);

    const hybrid = screen.getByRole("button", { name: /Hybrid/ });
    expect(hybrid).toBeDisabled();
    fireEvent.click(hybrid);
    expect(onModeSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /In Person/ }));
    expect(onModeSelect).toHaveBeenCalledWith("In Person");
  });
});
