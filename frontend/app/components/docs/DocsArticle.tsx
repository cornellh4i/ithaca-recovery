"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DESKTOP_BREAKPOINT } from "../../../util/common/breakpoints";
import { parseMarkdown } from "../../../util/docs/parseMarkdown";
import type { DocEntry } from "../../../util/docs/loadDocs";
import { useScrollNavHide } from "../../../hooks/useScrollNavHide";
import { CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, PrintIcon, TocToggleIcon } from "./DocsIcons";
import TocList from "./DocsTocList";
import { handleCodeCopyClick } from "../../../util/docs/codeCopy";
import styles from "./DocsArticle.module.scss";
// Only for the two chrome-button classes shared with the shell (.sidebarIconBtn/.sidebarClose)
// -- they stay defined once, in the shell's module, rather than being duplicated here.
import shellStyles from "./DocsShell.module.scss";

interface DocsArticleProps {
  activeDoc: DocEntry;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

// Rendered from [[...slug]]/page.tsx -- the part of the docs page that's SUPPOSED to remount on
// every doc-to-doc navigation (a new doc starts at the top, gets a fresh TOC, etc). The
// surrounding chrome (sidebar, search) lives in docs/layout.tsx's DocsShell instead, precisely
// so it doesn't remount along with this -- see DocsShell.tsx's own comment for why.
const DocsArticle: React.FC<DocsArticleProps> = ({ activeDoc }) => {
  // .article is its own scroll pane on this page (see DocsArticle.module.scss), not .content --
  // .content itself never scrolls here, so the mobile hide-on-scroll behavior ClientLayout wires
  // up globally onto .content has nothing to react to on /docs. Same hook, reattached to the
  // pane that actually scrolls here.
  const { handleScroll: handleArticleScroll } = useScrollNavHide();
  // null means "not yet measured" (no window on the server, client hasn't measured yet) -- same
  // three-state convention DocsShell's own `compact` uses.
  const [tocHidden, setTocHidden] = useState<boolean | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeHeadingSlug, setActiveHeadingSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [markdownMenuOpen, setMarkdownMenuOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const tocPanelRef = useRef<HTMLDivElement>(null);
  const tocNavRef = useRef<HTMLElement>(null);
  const prevTocHiddenRef = useRef<boolean | null>(null);

  useEffect(() => {
    const checkBreakpoint = () => {
      const next = window.innerWidth < DESKTOP_BREAKPOINT;
      if (prevTocHiddenRef.current && !next) setTocOpen(false);
      prevTocHiddenRef.current = next;
      setTocHidden(next);
    };
    checkBreakpoint();
    window.addEventListener("resize", checkBreakpoint);
    return () => window.removeEventListener("resize", checkBreakpoint);
  }, []);

  // Closes the "on this page" popover left open from the previous doc -- this component remounts
  // fresh per doc, so tocOpen's own initial state already handles that; this only matters for the
  // rare case where activeDoc.slug changes without a full remount (there isn't one today, but
  // matching the reset explicitly here costs nothing and protects against that assumption
  // silently breaking later).
  useEffect(() => {
    setTocOpen(false);
    setCopied(false);
    setMarkdownMenuOpen(false);
  }, [activeDoc.slug]);

  const { html, toc } = useMemo(() => parseMarkdown(activeDoc.markdown), [activeDoc.markdown]);

  // Fixed locale/timeZone (not the visitor's own) so this renders identically on the server and
  // after hydration -- a locale- or timeZone-dependent format here would mismatch whenever the
  // rendering machine's Intl defaults differ from the browser's.
  const lastEditedLabel = useMemo(
    () => DATE_FORMATTER.format(new Date(activeDoc.lastEdited)),
    [activeDoc.lastEdited]
  );

  // Copies the raw markdown source (not the rendered HTML) -- useful for pasting into a GitHub
  // issue/PR, another editor, or back into an LLM, none of which want this page's rendered DOM.
  // 2s revert matches Toast's own auto-dismiss feel elsewhere in the app, just local state here
  // instead of a real toast, since this is a one-off inline confirmation, not a cross-page event.
  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(activeDoc.markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [activeDoc.markdown]);

  // Opens this doc's raw markdown at its own stable, shareable URL (GitHub's "Raw" button, same
  // idea) -- /docs/<slug>.md, served by app/api/docs-raw/route.ts via next.config.mjs's rewrite.
  // Just appends ".md" to the current path rather than reading activeDoc.slug directly, since the
  // current URL is already exactly "/docs" + "/" + slug (or bare "/docs" when slug is "").
  const handleOpenMarkdown = useCallback(() => {
    window.open(`${window.location.pathname}.md`, "_blank");
  }, []);

  // The still-open menu can't leak into the printout even though window.print() blocks before
  // React commits the close -- .copyMarkdownGroup is display: none under @media print (see
  // DocsArticle.module.scss's print block).
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // INVARIANT: this object's identity must stay stable across re-renders that don't change the
  // markdown. React diffs dangerouslySetInnerHTML by the wrapper object's *identity*, never by
  // the HTML string's value (see updateProperties' `nextProp === lastProp` prop loop in
  // react-dom) -- so an inline `{{ __html: html }}` literal re-assigns <main>.innerHTML on every
  // single render. That re-parses the whole document and, critically, destroys and recreates
  // every heading node inside it, which is what silently broke scrollspy: this page re-renders
  // on every scroll direction change (useScrollNavHide flips navHidden in context), so the
  // article's DOM was being rebuilt out from under the scrollspy effect constantly. It also
  // intermittently reset the pane's scroll position back to the top.
  const articleHtml = useMemo(() => ({ __html: html }), [html]);

  // Scrollspy: highlights whichever h1/h2 is currently nearest the top of the article. The
  // active heading is the last one (in document order) whose top has already crossed the
  // activation line, which stays correct anywhere within a section (including inside its h3
  // subsections, not just right at the h2's own boundary).
  const updateActiveHeading = useCallback(() => {
    const article = articleRef.current;
    if (!article) return;
    const tocSlugs = new Set(toc.map((item) => item.slug));
    if (tocSlugs.size === 0) {
      setActiveHeadingSlug(null);
      return;
    }

    // INVARIANT: re-query the headings on every update rather than caching the node list.
    // <main>'s content comes from dangerouslySetInnerHTML, so any commit that re-assigns it
    // swaps every heading node out for a fresh one. A cached-but-detached node reports
    // getBoundingClientRect().top === 0, and since 0 satisfies the "already scrolled past"
    // test, *every* heading looks passed at once and the loop below pins the highlight to the
    // last one permanently. Live lookups can't go stale that way. querySelectorAll returns
    // document order, which is the order the TOC is built in.
    const headingEls = Array.from(
      article.querySelectorAll<HTMLElement>("h1[id], h2[id]")
    ).filter((el) => tocSlugs.has(el.id));
    if (headingEls.length === 0) return;

    // Measured from the article pane's own top edge, not the viewport's -- the article is its
    // own scroll container (own overflow-y:auto, see DocsArticle.module.scss's .article) rather
    // than .content, since the three columns each scroll independently on this page. A
    // viewport-absolute line would have to be re-derived from the navbar's height at every
    // breakpoint, and would be wrong again while the mobile navbar is hidden. 80px clears the
    // largest scroll-margin-top the headings use (72px on phones, see the stylesheet), so a
    // heading jumped to by clicking its own TOC link lands already counted as active.
    const lineY = article.getBoundingClientRect().top + 80;
    let current = headingEls[0];
    for (const el of headingEls) {
      if (el.getBoundingClientRect().top <= lineY) {
        current = el;
      } else {
        break;
      }
    }
    setActiveHeadingSlug(current.id);
  }, [toc]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    updateActiveHeading();
    article.addEventListener("scroll", updateActiveHeading, { passive: true });
    // A fragment jump moves the article's scroll position without firing a scroll event on it,
    // so the scroll listener alone never sees deep links or back/forward between #hashes -- this
    // also covers a search result's native anchor-link navigation landing on this doc.
    window.addEventListener("hashchange", updateActiveHeading);
    return () => {
      article.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("hashchange", updateActiveHeading);
    };
    // tocHidden is in the deps (even though it's not read here) because this component renders
    // null until it resolves (see the guard near the bottom) -- articleRef.current is still null
    // on the render where this effect first runs with a real `toc`, so it bails out via the
    // `!article` check above and never re-fires once tocHidden flips from null to a real boolean
    // and <main> actually mounts, unless that flip is itself a dependency here.
  }, [updateActiveHeading, tocHidden]);

  // Clicking a TOC link scrolls the article via the browser's own fragment jump, which fires no
  // scroll event on the pane -- without this the highlight stays wherever it was and the entry
  // you just clicked never lights up. Deferred a macrotask because the jump is the click's
  // default action, so it hasn't happened yet while this handler runs. hashchange above doesn't
  // cover re-clicking the entry you're already on (same hash -> no event), which still moves
  // the scroll position if you'd scrolled away since.
  const handleTocNavigate = useCallback(() => {
    setTimeout(updateActiveHeading, 0);
  }, [updateActiveHeading]);

  // Keeps the highlighted TOC entry visible inside the TOC's own scroll region as scrollspy
  // moves it -- .tocNav/.tocPanel have their own max-height + overflow-y:auto, so without this,
  // scrolling the article far enough (in either direction) can move the active heading past the
  // TOC's own visible area, and the TOC pane never follows since nothing scrolls it. block:
  // "nearest" only moves it the minimum needed, so this doesn't fight the user's own TOC scroll
  // when the active link is already visible.
  useEffect(() => {
    if (!activeHeadingSlug) return;
    const container = tocPanelRef.current ?? tocNavRef.current;
    const link = container?.querySelector<HTMLElement>(
      `a[href="#${CSS.escape(activeHeadingSlug)}"]`
    );
    link?.scrollIntoView({ block: "nearest" });
  }, [activeHeadingSlug]);

  // See tocHidden's own state comment above -- render nothing until it's measured, same as
  // DocsShell's own compact === null guard.
  if (tocHidden === null) {
    return null;
  }

  return (
    <React.Fragment>
      <div className={styles.articleColumn}>
        <div className={styles.docMeta}>
          <span>
            Last edited {lastEditedLabel}
            {activeDoc.editedBy ? ` by ${activeDoc.editedBy}` : ""}
          </span>
          <span className={styles.docMetaDot} aria-hidden="true" />
          <span>
            {activeDoc.readingTimeMinutes} min read
          </span>
          <div className={styles.copyMarkdownGroup}>
            <button type="button" className={styles.copyMarkdownBtn} onClick={handleCopyMarkdown}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied ? "Copied" : "Copy as Markdown"}
            </button>
            <button
              type="button"
              className={styles.copyMarkdownCaretBtn}
              aria-label="More markdown options"
              aria-expanded={markdownMenuOpen}
              onClick={() => setMarkdownMenuOpen((prev) => !prev)}
            >
              <ChevronDownIcon size={12} />
            </button>
            {markdownMenuOpen && (
              <React.Fragment>
                <div className={styles.tocScrim} onClick={() => setMarkdownMenuOpen(false)} />
                <div className={styles.copyMarkdownMenu}>
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyMarkdown();
                      setMarkdownMenuOpen(false);
                    }}
                  >
                    <CopyIcon size={14} /> Copy as Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenMarkdown();
                      setMarkdownMenuOpen(false);
                    }}
                  >
                    <ExternalLinkIcon size={14} /> Open Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePrint();
                      setMarkdownMenuOpen(false);
                    }}
                  >
                    <PrintIcon size={14} /> Print…
                  </button>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
        <main
          ref={articleRef}
          className={styles.article}
          onScroll={handleArticleScroll}
          // Delegated: the copy buttons live inside dangerouslySetInnerHTML content, so a
          // per-button listener would be lost on every innerHTML re-assignment.
          onClick={handleCodeCopyClick}
          dangerouslySetInnerHTML={articleHtml}
        />

        {tocHidden && (
          <div className={styles.tocToggleSlot}>
            <button
              type="button"
              className={shellStyles.sidebarIconBtn}
              aria-label="Open on this page"
              onClick={() => setTocOpen((prev) => !prev)}
            >
              <TocToggleIcon />
            </button>
            {tocOpen && (
              <React.Fragment>
                <div className={styles.tocScrim} onClick={() => setTocOpen(false)} />
                <div className={styles.tocPanel} ref={tocPanelRef}>
                  <div className={styles.tocPanelHeader}>
                    <span>On this page</span>
                    <button
                      type="button"
                      className={shellStyles.sidebarClose}
                      aria-label="Close"
                      onClick={() => setTocOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <TocList
                    toc={toc}
                    activeSlug={activeHeadingSlug}
                    onNavigate={() => {
                      setTocOpen(false);
                      handleTocNavigate();
                    }}
                  />
                </div>
              </React.Fragment>
            )}
          </div>
        )}
      </div>

      {!tocHidden && (
        <nav className={styles.tocNav} ref={tocNavRef}>
          <div className={styles.tocLabel}>On this page</div>
          <TocList toc={toc} activeSlug={activeHeadingSlug} onNavigate={handleTocNavigate} />
        </nav>
      )}
    </React.Fragment>
  );
};

export default DocsArticle;
