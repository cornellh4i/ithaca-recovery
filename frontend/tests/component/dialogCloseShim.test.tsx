import { attachDialogCloseShim } from "../../util/docs/dialogCloseShim";

// jsdom never fires a native `close` event when the `open` attribute is toggled directly,
// which conveniently models the broken Chromium builds this shim exists for (see the module
// comment) -- the compliant-browser path is simulated by dispatching the native event by hand.

const flushMutations = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("attachDialogCloseShim", () => {
  let dialog: HTMLDialogElement;
  let closeEvents: number;
  let detach: (() => void) | null;

  beforeEach(() => {
    jest.useFakeTimers();
    dialog = document.createElement("dialog");
    document.body.appendChild(dialog);
    closeEvents = 0;
    detach = null;
  });

  afterEach(() => {
    detach?.();
    dialog.remove();
    jest.useRealTimers();
  });

  const countCloses = () => dialog.addEventListener("close", () => { closeEvents += 1; });

  it("dispatches a synthetic close when the open attribute drops without a native event", async () => {
    detach = attachDialogCloseShim(dialog);
    countCloses();

    dialog.setAttribute("open", "");
    await jest.advanceTimersByTimeAsync(0);
    dialog.removeAttribute("open");
    await jest.advanceTimersByTimeAsync(150);

    expect(closeEvents).toBe(1);
  });

  it("stays silent when the native close event arrives first (spec-compliant browsers)", async () => {
    detach = attachDialogCloseShim(dialog);
    countCloses();

    dialog.setAttribute("open", "");
    await jest.advanceTimersByTimeAsync(0);
    // A compliant browser fires close alongside dropping the attribute.
    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
    await jest.advanceTimersByTimeAsync(150);

    // Only the native event -- no synthetic duplicate on top of it.
    expect(closeEvents).toBe(1);
  });

  it("re-arms for every open/close cycle", async () => {
    detach = attachDialogCloseShim(dialog);
    countCloses();

    for (let cycle = 0; cycle < 2; cycle++) {
      dialog.setAttribute("open", "");
      await jest.advanceTimersByTimeAsync(0);
      dialog.removeAttribute("open");
      await jest.advanceTimersByTimeAsync(150);
    }

    expect(closeEvents).toBe(2);
  });

  it("stops watching after detach", async () => {
    detach = attachDialogCloseShim(dialog);
    countCloses();
    detach();
    detach = null;

    dialog.setAttribute("open", "");
    await jest.advanceTimersByTimeAsync(0);
    dialog.removeAttribute("open");
    await jest.advanceTimersByTimeAsync(150);

    expect(closeEvents).toBe(0);
  });
});
