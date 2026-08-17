// Some Chromium 150 builds (observed in Brave, 2026-08) close a native <dialog> without ever
// firing its `close` event, violating the HTML spec (https://html.spec.whatwg.org/#close-the-dialog
// step: "queue an element task ... fire an event named close"). Pagefind's modal resets its
// internal open-flag only from that event, so one open+close left docs search permanently
// unopenable until a hard reload (GitHub #477). This watches the dialog's `open` attribute and
// re-dispatches a synthetic `close` when the native event doesn't arrive within a beat; on
// spec-compliant browsers the native event always lands first and the shim never fires.

// Long enough for the native close event's queued task to land first on compliant browsers,
// short enough that Pagefind's bookkeeping still runs before a user can plausibly re-click.
const NATIVE_CLOSE_GRACE_MS = 100;

export function attachDialogCloseShim(dialog: HTMLDialogElement): () => void {
  let sawNativeClose = false;
  const markNativeClose = () => { sawNativeClose = true; };
  dialog.addEventListener("close", markNativeClose);

  const observer = new MutationObserver(() => {
    if (dialog.open) {
      sawNativeClose = false;
      return;
    }
    setTimeout(() => {
      if (!sawNativeClose && !dialog.open) dialog.dispatchEvent(new Event("close"));
    }, NATIVE_CLOSE_GRACE_MS);
  });
  observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });

  return () => {
    observer.disconnect();
    dialog.removeEventListener("close", markNativeClose);
  };
}
