import React from "react";
import { render, screen } from "@testing-library/react";
import BoxText from "../../app/components/atoms/BoxText";

const baseProps = {
  boxType: "Meeting Block" as const,
  title: "Weekly Check-in",
  primaryColor: "#CC3366",
  meetingId: "meeting-1",
  onClick: jest.fn(),
};

describe("BoxText", () => {
  it("renders tags by default", () => {
    render(<BoxText {...baseProps} tags={["In Person", "AA"]} />);

    expect(screen.getByText("In Person")).toBeInTheDocument();
    expect(screen.getByText("AA")).toBeInTheDocument();
  });

  it("prefixes the mode tag pill itself with the mode icon by default", () => {
    render(<BoxText {...baseProps} tags={["In Person", "AA"]} />);

    const tag = screen.getByText("In Person");
    expect(tag.querySelector("img")).toHaveAttribute("src", "/svg/location-icon.svg");
    expect(screen.getByText("AA").querySelector("img")).not.toBeInTheDocument();
  });

  it("hides tags and prefixes the title with the mode icon when hideTags is set", () => {
    render(<BoxText {...baseProps} tags={["In Person", "AA"]} hideTags />);

    expect(screen.queryByText("In Person")).not.toBeInTheDocument();
    expect(screen.queryByText("AA")).not.toBeInTheDocument();

    const heading = screen.getByRole("heading", { name: /Weekly Check-in/ });
    const icon = heading.querySelector("img");
    expect(icon).toHaveAttribute("src", "/svg/location-icon.svg");
  });

  it.each([
    ["In Person", "/svg/location-icon.svg"],
    ["Remote", "/svg/video-call-icon.svg"],
    ["Hybrid", "/svg/co-present-icon.svg"],
  ])("maps the %s mode tag to %s", (modeTag, expectedSrc) => {
    render(<BoxText {...baseProps} tags={[modeTag, "AA"]} hideTags />);

    const heading = screen.getByRole("heading", { name: /Weekly Check-in/ });
    expect(heading.querySelector("img")).toHaveAttribute("src", expectedSrc);
  });

  it("renders no prefix icon when hideTags is set but no mode tag is present", () => {
    render(<BoxText {...baseProps} tags={["AA"]} hideTags />);

    const heading = screen.getByRole("heading", { name: "Weekly Check-in" });
    expect(heading.querySelector("img")).not.toBeInTheDocument();
  });
});
