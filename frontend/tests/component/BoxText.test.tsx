import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import BoxText from "../../app/components/ui/displays/BoxText";

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
    expect(tag.querySelector("[data-icon-name]")).toHaveAttribute("data-icon-name", "location");
    expect(screen.getByText("AA").querySelector("[data-icon-name]")).not.toBeInTheDocument();
  });

  it("hides tags and prefixes the title with the mode icon when hideTags is set", () => {
    render(<BoxText {...baseProps} tags={["In Person", "AA"]} hideTags />);

    expect(screen.queryByText("In Person")).not.toBeInTheDocument();
    expect(screen.queryByText("AA")).not.toBeInTheDocument();

    const heading = screen.getByRole("heading", { name: /Weekly Check-in/ });
    const icon = heading.querySelector("[data-icon-name]");
    expect(icon).toHaveAttribute("data-icon-name", "location");
  });

  it.each([
    ["In Person", "location"],
    ["Remote", "video-call"],
    ["Hybrid", "co-present"],
  ])("maps the %s mode tag to %s", (modeTag, expectedIconName) => {
    render(<BoxText {...baseProps} tags={[modeTag, "AA"]} hideTags />);

    const heading = screen.getByRole("heading", { name: /Weekly Check-in/ });
    expect(heading.querySelector("[data-icon-name]")).toHaveAttribute("data-icon-name", expectedIconName);
  });

  it("renders no prefix icon when hideTags is set but no mode tag is present", () => {
    render(<BoxText {...baseProps} tags={["AA"]} hideTags />);

    const heading = screen.getByRole("heading", { name: "Weekly Check-in" });
    expect(heading.querySelector("[data-icon-name]")).not.toBeInTheDocument();
  });

  it("tier=\"compact\" applies the same styling the compact boolean already did", () => {
    const { container: viaTier } = render(<BoxText {...baseProps} tags={["AA"]} tier="compact" time="9-10AM" />);
    const { container: viaBoolean } = render(<BoxText {...baseProps} tags={["AA"]} compact time="9-10AM" />);

    expect((viaTier.firstChild as HTMLElement).className).toBe((viaBoolean.firstChild as HTMLElement).className);
  });

  it("tier=\"subcompact\" shows only the title (with mode icon prefix) — no time, no tags", () => {
    render(<BoxText {...baseProps} tags={["In Person", "AA"]} time="9-10AM" tier="subcompact" />);

    expect(screen.queryByText("In Person")).not.toBeInTheDocument();
    expect(screen.queryByText("AA")).not.toBeInTheDocument();
    expect(screen.queryByText("9-10AM")).not.toBeInTheDocument();

    const heading = screen.getByRole("heading", { name: /Weekly Check-in/ });
    expect(heading.querySelector("[data-icon-name]")).toHaveAttribute("data-icon-name", "location");
  });

  it("tier=\"subcompact\" still shows the title with no icon when no mode tag is present", () => {
    render(<BoxText {...baseProps} tags={["AA"]} time="9-10AM" tier="subcompact" />);

    const heading = screen.getByRole("heading", { name: "Weekly Check-in" });
    expect(heading.querySelector("[data-icon-name]")).not.toBeInTheDocument();
  });

  it("defaults to the full tier when neither tier nor compact is passed", () => {
    render(<BoxText {...baseProps} tags={["In Person", "AA"]} time="9-10AM" />);

    expect(screen.getByText("In Person")).toBeInTheDocument();
    expect(screen.getByText("9-10AM")).toBeInTheDocument();
  });

  describe("Meeting Block accessibility", () => {
    it("is a focusable button named by ariaLabel", () => {
      render(<BoxText {...baseProps} ariaLabel="Weekly Check-in, 9 - 10 AM, Serenity Room, Hybrid" />);

      const chip = screen.getByRole("button", { name: "Weekly Check-in, 9 - 10 AM, Serenity Room, Hybrid" });
      expect(chip).toHaveAttribute("tabindex", "0");
    });

    it("activates on Enter with the meeting id", () => {
      const onClick = jest.fn();
      render(<BoxText {...baseProps} onClick={onClick} ariaLabel="Weekly Check-in" />);

      fireEvent.keyDown(screen.getByRole("button", { name: "Weekly Check-in" }), { key: "Enter" });
      expect(onClick).toHaveBeenCalledWith("meeting-1", expect.anything());
    });

    it("activates on Space", () => {
      const onClick = jest.fn();
      render(<BoxText {...baseProps} onClick={onClick} ariaLabel="Weekly Check-in" />);

      fireEvent.keyDown(screen.getByRole("button", { name: "Weekly Check-in" }), { key: " " });
      expect(onClick).toHaveBeenCalledWith("meeting-1", expect.anything());
    });

    it("does not activate on other keys", () => {
      const onClick = jest.fn();
      render(<BoxText {...baseProps} onClick={onClick} ariaLabel="Weekly Check-in" />);

      fireEvent.keyDown(screen.getByRole("button", { name: "Weekly Check-in" }), { key: "Escape" });
      expect(onClick).not.toHaveBeenCalled();
    });

    it("leaves Room Blocks as non-interactive labels", () => {
      render(<BoxText {...baseProps} boxType="Room Block" title="Serenity Room" />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
