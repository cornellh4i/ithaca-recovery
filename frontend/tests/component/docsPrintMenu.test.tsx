import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DocsArticle from "../../app/components/docs/DocsArticle";
import { CalendarProvider } from "../../app/context/CalendarProvider";
import type { DocEntry } from "../../util/docs/loadDocs";

const doc: DocEntry = {
  slug: "reference/quick-reference-card",
  title: "Quick Reference Card",
  group: "User Guide",
  subgroup: "Reference",
  markdown: "# Quick Reference Card\n\nPrint me.",
  lastEdited: "2026-08-01T00:00:00.000Z",
  editedBy: "Someone",
  readingTimeMinutes: 1,
};

const printFn = jest.fn();

beforeEach(() => {
  printFn.mockReset();
  // jsdom's window.print is a "not implemented" stub that logs an error when called.
  Object.defineProperty(window, "print", { value: printFn, configurable: true });
  // jsdom has no Element.scrollIntoView; DocsArticle's scrollspy calls it on the active TOC link.
  Element.prototype.scrollIntoView = jest.fn();
});

const renderArticle = () =>
  render(
    <CalendarProvider initialDate={new Date(Date.UTC(2026, 7, 1, 16, 0))}>
      <DocsArticle activeDoc={doc} />
    </CalendarProvider>
  );

describe("docs Print menu item", () => {
  it("renders in the markdown options menu and triggers window.print", () => {
    renderArticle();

    fireEvent.click(screen.getByRole("button", { name: "More markdown options" }));
    const printItem = screen.getByRole("button", { name: "Print…" });

    fireEvent.click(printItem);

    expect(printFn).toHaveBeenCalledTimes(1);
  });

  it("closes the menu after printing, like the other menu items", () => {
    renderArticle();

    fireEvent.click(screen.getByRole("button", { name: "More markdown options" }));
    fireEvent.click(screen.getByRole("button", { name: "Print…" }));

    expect(screen.queryByRole("button", { name: "Print…" })).not.toBeInTheDocument();
  });
});
