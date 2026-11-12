import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "../../app/components/theme/ThemeToggle";
import ThemeOptions from "../../app/components/theme/ThemeOptions";
import { THEME_STORAGE_KEY } from "../../util/common/theme";

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("data-theme");
});

describe("ThemeToggle (desktop navbar)", () => {
  it("starts in System with nothing stored, naming the current mode and the next one", () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");

    expect(button).toHaveAttribute("data-theme-preference", "system");
    expect(button).toHaveAccessibleName("Theme: System. Switch to Light.");
    expect(button.querySelector('[data-icon-name="theme-system"]')).not.toBeNull();
    expect(root).not.toHaveAttribute("data-theme");
  });

  it("cycles Light -> Dark -> System, persisting Light/Dark and clearing for System", () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId("theme-toggle");

    fireEvent.click(button);
    expect(button).toHaveAttribute("data-theme-preference", "light");
    expect(button.querySelector('[data-icon-name="theme-light"]')).not.toBeNull();
    expect(root).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    fireEvent.click(button);
    expect(button).toHaveAttribute("data-theme-preference", "dark");
    expect(button).toHaveAccessibleName("Theme: Dark. Switch to System.");
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    fireEvent.click(button);
    expect(button).toHaveAttribute("data-theme-preference", "system");
    expect(root).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("picks up a stored preference on mount and re-stamps <html>", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);

    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-preference", "dark");
    expect(root).toHaveAttribute("data-theme", "dark");
  });

  it("follows a change made in another tab", () => {
    render(<ThemeToggle />);
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });

    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-preference", "dark");
    expect(root).toHaveAttribute("data-theme", "dark");
  });
});

describe("ThemeOptions (mobile sidebar)", () => {
  it("renders all three choices as a labeled radio group with the current one checked", () => {
    render(<ThemeOptions />);

    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
  });

  it("selects any choice directly and stays in sync with the navbar toggle", () => {
    render(
      <>
        <ThemeOptions />
        <ThemeToggle />
      </>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(root).toHaveAttribute("data-theme", "dark");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-preference", "dark");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(root).not.toHaveAttribute("data-theme");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
