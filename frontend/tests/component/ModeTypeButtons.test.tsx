import React from "react";
import { render, screen } from "@testing-library/react";
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
});
