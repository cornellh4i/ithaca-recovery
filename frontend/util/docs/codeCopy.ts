// Delegated click handler for the copy buttons parseMarkdown bakes into every docs code block.
// One listener on the article root (see DocsArticle's <main onClick>) instead of one per button:
// the article's content arrives via dangerouslySetInnerHTML, so per-node listeners would be
// destroyed on every innerHTML re-assignment while delegation keeps working untouched.

const COPIED_RESET_MS = 2000;

const resetTimers = new WeakMap<HTMLElement, number>();

export async function handleCodeCopyClick(event: { target: unknown }): Promise<void> {
  const target = event.target as Element | null;
  const button = target?.closest?.<HTMLElement>(".codeCopyButton");
  if (!button) return;

  const pre = button.closest(".codeBlock")?.querySelector("pre");
  const text = pre?.textContent;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard can be denied/unavailable outside a secure context -- same fallback message as
    // the Backups tab's copy button: leave the button un-flipped and point at manual selection.
    button.title = "Copy failed — select the text manually";
    return;
  }

  button.title = "";
  button.dataset.copied = "true";
  button.setAttribute("aria-label", "Copied");
  const existing = resetTimers.get(button);
  if (existing !== undefined) window.clearTimeout(existing);
  resetTimers.set(
    button,
    window.setTimeout(() => {
      delete button.dataset.copied;
      button.setAttribute("aria-label", "Copy code block");
      resetTimers.delete(button);
    }, COPIED_RESET_MS),
  );
}
