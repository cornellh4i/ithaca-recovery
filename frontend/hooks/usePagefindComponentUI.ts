"use client";

import { useEffect } from "react";

const STYLESHEET_HREF = "/pagefind/pagefind-component-ui.css";
const SCRIPT_SRC = "/pagefind/pagefind-component-ui.js";

// Module scope, not a ref/state -- DocsShell fully unmounts/remounts on every doc-to-doc
// navigation (see its own module-scope-variable comments for why), so a per-component guard
// would re-inject the tags on every navigation. Injecting is idempotent either way (duplicate
// <link>/<script> tags wouldn't break anything), but there's no reason to ask the browser to
// refetch and re-register the same custom elements repeatedly.
let injected = false;

// Lazily loads Pagefind's prebuilt Component UI (pagefind-modal-trigger, pagefind-modal,
// pagefind-searchbox -- see DocsShell.tsx) so the /docs page never ships this bundle to a
// visitor who doesn't open search. Only exists after `yarn build` (see build-scripts/
// generate-pagefind-index.mjs); in dev this 404s and the custom elements simply never
// register, rendering as inert unstyled tags -- there's no dev fallback UI, unlike the raw
// search API DocsShell used before this switched to Pagefind's own components.
export function usePagefindComponentUI(): void {
  useEffect(() => {
    if (injected) return;
    injected = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLESHEET_HREF;
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.type = "module";
    script.src = SCRIPT_SRC;
    document.head.appendChild(script);
  }, []);
}
