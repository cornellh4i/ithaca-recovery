import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { parseMarkdown } from "../../util/docs/parseMarkdown";
import { handleCodeCopyClick } from "../../util/docs/codeCopy";

// Mirrors DocsArticle's real wiring: parseMarkdown's HTML via dangerouslySetInnerHTML with the
// one delegated click handler on the container.
const Article: React.FC<{ markdown: string }> = ({ markdown }) => (
  <main
    onClick={handleCodeCopyClick}
    dangerouslySetInnerHTML={{ __html: parseMarkdown(markdown).html }}
  />
);

const writeText = jest.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  // jsdom has no navigator.clipboard at all.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("docs code block copy button", () => {
  it("copies the block's text and flips to the copied state", async () => {
    render(<Article markdown={"```sh\nyarn test:all\n```"} />);
    const button = screen.getByRole("button", { name: "Copy code block" });

    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute("data-copied", "true"));
    expect(writeText).toHaveBeenCalledWith("yarn test:all\n");
    expect(button).toHaveAccessibleName("Copied");
  });

  it("reverts to the idle state after the reset delay", async () => {
    jest.useFakeTimers();
    try {
      render(<Article markdown={"```\nx\n```"} />);
      const button = screen.getByRole("button", { name: "Copy code block" });

      // fireEvent + explicit flushes rather than userEvent: fake timers stall userEvent's
      // internal waits.
      fireEvent.click(button);
      await act(async () => {});
      expect(button).toHaveAttribute("data-copied", "true");

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(button).not.toHaveAttribute("data-copied");
      expect(button).toHaveAccessibleName("Copy code block");
    } finally {
      jest.useRealTimers();
    }
  });

  it("copies only its own block when several are present", async () => {
    render(<Article markdown={"```\nfirst\n```\n\n```\nsecond\n```"} />);
    const buttons = screen.getAllByRole("button", { name: "Copy code block" });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[1]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("second\n"));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("stays un-flipped and points at manual selection when the clipboard write fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<Article markdown={"```\nx\n```"} />);
    const button = screen.getByRole("button", { name: "Copy code block" });

    fireEvent.click(button);

    await waitFor(() =>
      expect(button).toHaveAttribute("title", "Copy failed — select the text manually"),
    );
    expect(button).not.toHaveAttribute("data-copied");
  });

  it("ignores clicks elsewhere in the article", () => {
    render(<Article markdown={"para\n\n```\nx\n```"} />);
    fireEvent.click(screen.getByText("para"));
    expect(writeText).not.toHaveBeenCalled();
  });
});
