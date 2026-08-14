import React from "react";
import { render } from "@testing-library/react";
import Icon, { ALL_ICON_NAMES } from "../../app/components/ui/displays/Icon";

describe("Icon", () => {
  it.each(ALL_ICON_NAMES)("renders name=\"%s\" as a non-empty element with matching data-icon-name", (name) => {
    const { container } = render(<Icon name={name} />);
    const el = container.querySelector("[data-icon-name]");

    expect(el).not.toBeNull();
    expect(el).toHaveAttribute("data-icon-name", name);
  });

  it("maps sync-error to a distinct glyph from danger-circle/warning-circle -- not the same icon reused", () => {
    // Regression guard: sync-error was once wrongly mapped to the same plain error-circle
    // glyph danger-circle/warning-circle use, losing the sync-specific meaning. Compares the
    // rendered path data, since MUI's generated class name doesn't encode which icon it is.
    const pathOf = (name: "sync-error" | "danger-circle" | "warning-circle") =>
      render(<Icon name={name} />).container.querySelector("svg path")?.getAttribute("d");

    const syncErrorPath = pathOf("sync-error");
    const dangerCirclePath = pathOf("danger-circle");

    expect(syncErrorPath).toBeTruthy();
    expect(dangerCirclePath).toBeTruthy();
    expect(syncErrorPath).not.toBe(dangerCirclePath);
    expect(pathOf("warning-circle")).toBe(dangerCirclePath); // same glyph, different ambient color
  });

  it("warns (dev-only) and renders nothing broken for an unregistered name built at runtime", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Cast past IconName -- this simulates a name assembled from a runtime value (e.g. a
    // lookup table) rather than a literal call site, which the type system can't catch.
    const { container } = render(<Icon name={"not-a-real-icon" as unknown as Parameters<typeof Icon>[0]["name"]} />);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not-a-real-icon"));
    // React omits an <img src> attribute entirely when the prop value is undefined.
    expect(container.querySelector("[data-icon-name]")).not.toHaveAttribute("src");
    warnSpy.mockRestore();
  });

  it("renders an MUI-backed icon as an svg carrying data-icon-name", () => {
    const { container } = render(<Icon name="check" />);
    const el = container.querySelector("[data-icon-name]") as SVGElement;

    expect(el.tagName.toLowerCase()).toBe("svg");
    expect(el).toHaveAttribute("data-icon-name", "check");
  });

  it("renders a local-backed icon as an img carrying its /svg/ src and data-icon-name", () => {
    const { container } = render(<Icon name="google" />);
    const el = container.querySelector("[data-icon-name]") as HTMLImageElement;

    expect(el.tagName.toLowerCase()).toBe("img");
    expect(el).toHaveAttribute("data-icon-name", "google");
    expect(el).toHaveAttribute("src", "/svg/google-icon.svg");
  });

  it("is decorative by default: aria-hidden, no accessible name, no img role", () => {
    const { container } = render(<Icon name="check" />);
    const el = container.querySelector("[data-icon-name]") as HTMLElement;

    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).not.toHaveAttribute("aria-label");
    expect(el).not.toHaveAttribute("role");
  });

  it("becomes meaningful when given an ariaLabel: img role, aria-label set, no aria-hidden", () => {
    const { container } = render(<Icon name="check" ariaLabel="Available" />);
    const el = container.querySelector("[data-icon-name]") as HTMLElement;

    expect(el).toHaveAttribute("role", "img");
    expect(el).toHaveAttribute("aria-label", "Available");
    expect(el).not.toHaveAttribute("aria-hidden");
  });

  it("gives a decorative local icon an empty alt, and a meaningful one the ariaLabel as alt", () => {
    const { container: decorative } = render(<Icon name="google" />);
    expect(decorative.querySelector("img")).toHaveAttribute("alt", "");

    const { container: meaningful } = render(<Icon name="google" ariaLabel="Google" />);
    expect(meaningful.querySelector("img")).toHaveAttribute("alt", "Google");
  });

  it.each([
    ["sm", "16px"],
    ["md", "24px"],
    ["lg", "32px"],
  ])("resolves size token %s to %s", (token, expectedPx) => {
    const { container } = render(<Icon name="check" size={token as "sm" | "md" | "lg"} />);
    const el = container.querySelector("[data-icon-name]") as HTMLElement;

    expect(el.style.width).toBe(expectedPx);
    expect(el.style.height).toBe(expectedPx);
  });

  it("uses an explicit numeric size verbatim", () => {
    const { container } = render(<Icon name="check" size={28} />);
    const el = container.querySelector("[data-icon-name]") as HTMLElement;

    expect(el.style.width).toBe("28px");
    expect(el.style.height).toBe("28px");
  });

  it("sets no inline width/height when size is omitted, leaving sizing to external CSS", () => {
    const { container } = render(<Icon name="check" />);
    const el = container.querySelector("[data-icon-name]") as HTMLElement;

    expect(el.style.width).toBe("");
    expect(el.style.height).toBe("");
  });

  it("passes className through on both the MUI and local render paths", () => {
    const { container: mui } = render(<Icon name="check" className="my-class" />);
    expect(mui.querySelector("[data-icon-name]")).toHaveClass("my-class");

    const { container: local } = render(<Icon name="google" className="my-class" />);
    expect(local.querySelector("[data-icon-name]")).toHaveClass("my-class");
  });

  it("never sets an inline color -- every icon relies on ambient CSS currentColor", () => {
    const { container } = render(<Icon name="warning" />);
    const el = container.querySelector("[data-icon-name]") as HTMLElement;

    expect(el.style.color).toBe("");
  });
});
