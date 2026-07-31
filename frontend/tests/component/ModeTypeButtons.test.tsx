import React from "react";
import { render, screen } from "@testing-library/react";
import ModeTypeButtons from "../../app/components/atoms/ModeTypeButtons";

describe("ModeTypeButtons", () => {
  it.each([
    ["Hybrid", "/svg/co-present-icon.svg"],
    ["In Person", "/svg/location-icon.svg"],
    ["Remote", "/svg/video-call-icon.svg"],
  ])("prefixes the %s button with its mode icon", (mode, expectedSrc) => {
    render(<ModeTypeButtons selectedMode={mode} onModeSelect={jest.fn()} />);

    const button = screen.getByRole("button", { name: new RegExp(mode) });
    expect(button.querySelector("img")).toHaveAttribute("src", expectedSrc);
  });
});
