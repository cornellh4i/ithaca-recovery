"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TABLET_BREAKPOINT, DESKTOP_BREAKPOINT } from "../../../util/common/breakpoints";
import { parseMarkdown } from "../../../util/docs/parseMarkdown";
import type { DocEntry, DocMeta } from "../../../util/docs/loadDocs";
import { useScrollNavHide } from "../../../hooks/useScrollNavHide";
import TopLoadingBar from "../atoms/TopLoadingBar";
import { PanelToggleIcon, TocToggleIcon } from "./DocsIcons";
import TocList from "./DocsTocList";
import styles from "../../../styles/components/docs/DocsShell.module.scss";

interface DocsShellProps {
  activeDoc: DocEntry;
  docsMeta: DocMeta[];
}

interface DocGroup {
  name: string;
  docs: DocMeta[];
}

function buildGroups(docsMeta: DocMeta[]): DocGroup[] {
  const groups: DocGroup[] = [];
  docsMeta.forEach((doc) => {
    const existing = groups.find((g) => g.name === doc.group);
    if (existing) {
      existing.docs.push(doc);
    } else {
      groups.push({ name: doc.group, docs: [doc] });
    }
  });
  return groups;
}

// The root doc's slug is "" (see build-scripts/generate-docs-content.mjs's slugFromRelPath) --
// /docs itself, not /docs/.
function docHref(slug: string): string {
  return slug === "" ? "/docs" : `/docs/${slug}`;
}

// DocsShell renders from [[...slug]]/page.tsx, and the App Router rebuilds a *page's* entire
// subtree from scratch whenever a dynamic segment's value changes -- only layouts survive a
// segment change. So every doc-to-doc navigation unmounts this component and mounts a fresh one,
// handing .sidebarNav a brand-new DOM node whose scrollTop starts at 0. That's invisible for the
// article and the TOC (a new doc is supposed to start at the top), but the sidebar is shared
// chrome, not per-doc content: it should stay exactly where the reader left it. Nothing in
// component state can carry a value across an unmount, so this lives at module scope, which
// outlives the remount -- and is re-initialized by a real page load, which is the behavior we
// want there.
let lastSidebarScrollTop = 0;

const DocsShell: React.FC<DocsShellProps> = ({ activeDoc, docsMeta }) => {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  // .article is its own scroll pane on this page (see DocsShell.module.scss), not .content --
  // .content itself never scrolls here, so the mobile hide-on-scroll behavior ClientLayout wires
  // up globally onto .content has nothing to react to on /docs. Same hook, reattached to the
  // pane that actually scrolls here.
  const { handleScroll: handleArticleScroll } = useScrollNavHide();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // null means "not yet measured" (no window on the server, client hasn't measured yet) --
  // same three-state convention useIsPhone()/useViewport() use elsewhere in this app. Rendering
  // the desktop layout as a default guess until the real width is known would flash it on every
  // phone load right before snapping to compact; gating the render below on this instead avoids
  // that.
  const [compact, setCompact] = useState<boolean | null>(null);
  const [tocHidden, setTocHidden] = useState<boolean | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeHeadingSlug, setActiveHeadingSlug] = useState<string | null>(null);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const checkBreakpoints = () => {
      setCompact(window.innerWidth < TABLET_BREAKPOINT);
      setTocHidden((prev) => {
        const next = window.innerWidth < DESKTOP_BREAKPOINT;
        if (prev && !next) setTocOpen(false);
        return next;
      });
    };
    checkBreakpoints();
    window.addEventListener("resize", checkBreakpoints);
    return () => window.removeEventListener("resize", checkBreakpoints);
  }, []);

  // Closes any drawer/popover left open from the previous doc whenever navigation lands on a
  // new one -- covers every path a new slug can arrive by (sidebar click, browser back/
  // forward), not just the sidebar link's own onClick. Deliberately does not reset the
  // article's own scroll position -- switching docs keeps wherever you were scrolled to, it
  // doesn't jump back to the top.
  useEffect(() => {
    setSidebarOpen(false);
    setTocOpen(false);
  }, [activeDoc.slug]);

  // Restored from a ref callback rather than an effect: React attaches refs during the commit,
  // after the new node is in the document (so scrollHeight is already real) but before the browser
  // paints it -- an effect would let the sidebar paint at 0 first and visibly jump.
  const restoreSidebarScroll = useCallback((node: HTMLElement | null) => {
    if (node) node.scrollTop = lastSidebarScrollTop;
  }, []);

  // Recorded on every scroll rather than read back during the ref's cleanup, so this doesn't
  // depend on React tearing down refs before it detaches the node (a detached element reports
  // scrollTop 0, which would silently store the wrong value).
  const handleSidebarScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    lastSidebarScrollTop = event.currentTarget.scrollTop;
  }, []);

  const groups = useMemo(() => buildGroups(docsMeta), [docsMeta]);
  const { html, toc } = useMemo(() => parseMarkdown(activeDoc.markdown), [activeDoc.markdown]);

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
    // own scroll container (own overflow-y:auto, see DocsShell.module.scss's .article) rather
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
    // so the scroll listener alone never sees deep links or back/forward between #hashes.
    window.addEventListener("hashchange", updateActiveHeading);
    return () => {
      article.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("hashchange", updateActiveHeading);
    };
    // compact is in the deps (even though it's not read here) because this component renders
    // null until compact/tocHidden resolve (see the guard near the bottom) -- articleRef.current
    // is still null on the render where this effect first runs with a real `toc`, so it bails
    // out via the `!article` check above and never re-fires once compact flips from null to a
    // real boolean and <main> actually mounts, unless that flip is itself a dependency here.
  }, [updateActiveHeading, compact]);

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
    const link = document.querySelector<HTMLElement>(
      `a[class*="tocLink"][href="#${CSS.escape(activeHeadingSlug)}"]`
    );
    link?.scrollIntoView({ block: "nearest" });
  }, [activeHeadingSlug]);

  // Doc links stay real <Link>s (href for prefetch/right-click/open-in-new-tab), but the click
  // is intercepted so the resulting navigation runs inside a transition -- isNavigating from
  // that transition is the one signal TopLoadingBar needs, regardless of which link (sidebar or
  // future ones) triggered it.
  const navigateToDoc = (event: React.MouseEvent, href: string) => {
    event.preventDefault();
    setSidebarOpen(false);
    startNavigation(() => {
      router.push(href);
    });
  };

  // See the compact/tocHidden state comment above -- render nothing until both are measured,
  // same as AppNavbar's isPhone === null guard.
  if (compact === null || tocHidden === null) {
    return null;
  }

  return (
    <div className={styles.page}>
      <TopLoadingBar active={isNavigating} />
      <div className={`${styles.compactBar} ${compact ? styles.isCompact : ""}`}>
        <button
          type="button"
          className={styles.sidebarIconBtn}
          aria-label="Open contents"
          onClick={() => setSidebarOpen(true)}
        >
          <PanelToggleIcon />
        </button>
        <span className={styles.breadcrumbGroup}>{activeDoc.group}</span>
        <span className={styles.breadcrumbGroup}>/</span>
        <span className={styles.breadcrumbTitle}>{activeDoc.title}</span>
      </div>

      {compact && sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      <div className={styles.columns}>
        <nav
          ref={restoreSidebarScroll}
          onScroll={handleSidebarScroll}
          className={`${styles.sidebarNav} ${compact ? styles.isCompact : ""} ${
            compact && sidebarOpen ? styles.isOpen : ""
          }`}
        >
          <div className={`${styles.sidebarHeader} ${compact ? styles.isCompact : ""}`}>
            <span>Contents</span>
            <button
              type="button"
              className={styles.sidebarClose}
              aria-label="Close contents"
              onClick={() => setSidebarOpen(false)}
            >
              ✕
            </button>
          </div>
          {groups.map((group) => (
            <React.Fragment key={group.name}>
              <div className={styles.groupLabel}>{group.name}</div>
              {group.docs.map((doc) => (
                <Link
                  key={doc.slug}
                  href={docHref(doc.slug)}
                  className={`${styles.docLink} ${doc.slug === activeDoc.slug ? styles.isActive : ""}`}
                  onClick={(event) => navigateToDoc(event, docHref(doc.slug))}
                >
                  {doc.title}
                </Link>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className={styles.articleColumn}>
          <main
            ref={articleRef}
            className={styles.article}
            onScroll={handleArticleScroll}
            dangerouslySetInnerHTML={articleHtml}
          />

          {tocHidden && (
            <div className={styles.tocToggleSlot}>
              <button
                type="button"
                className={styles.sidebarIconBtn}
                aria-label="Open on this page"
                onClick={() => setTocOpen((prev) => !prev)}
              >
                <TocToggleIcon />
              </button>
              {tocOpen && (
                <React.Fragment>
                  <div className={styles.tocScrim} onClick={() => setTocOpen(false)} />
                  <div className={styles.tocPanel}>
                    <div className={styles.tocPanelHeader}>
                      <span>On this page</span>
                      <button
                        type="button"
                        className={styles.sidebarClose}
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
          <nav className={styles.tocNav}>
            <div className={styles.tocLabel}>On this page</div>
            <TocList toc={toc} activeSlug={activeHeadingSlug} onNavigate={handleTocNavigate} />
          </nav>
        )}
      </div>
    </div>
  );
};

export default DocsShell;
