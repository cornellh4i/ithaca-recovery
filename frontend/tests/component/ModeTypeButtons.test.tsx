import React from "react";
import { render, screen } from "@testing-library/react";
import ModeTypeButtons from "../../app/components/atoms/ModeTypeButtons";

describe("ModeTypeButtons", () => {
  it.each([
    ["Hybrid", "co-present"],
    ["In Person", "location"],
    ["Remote", "video-call"],
  ])("prefixes the %s button with its mode icon", (mode, expectedIconName) => {
    render(<ModeTypeButtons selectedMode={mode} onModeSelect={jest.fn()} />);

    const button = screen.getByRole("button", { name: new RegExp(mode) });
    expect(button.querySelector("[data-icon-name]")).toHaveAttribute("data-icon-name", expectedIconName);
  });
});
