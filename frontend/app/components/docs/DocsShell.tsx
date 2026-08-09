"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { TABLET_BREAKPOINT } from "../../../util/common/breakpoints";
import type { DocMeta } from "../../../util/docs/loadDocs";
import { usePagefindComponentUI } from "../../../hooks/usePagefindComponentUI";
import TopLoadingBar from "../atoms/TopLoadingBar";
import { PanelToggleIcon, SearchIcon, CloseIcon } from "./DocsIcons";
import styles from "../../../styles/components/docs/DocsShell.module.scss";

interface DocsShellProps {
  docsMeta: DocMeta[];
  children: React.ReactNode;
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

// DocsShell is rendered from docs/layout.tsx, not from [[...slug]]/page.tsx -- layouts survive
// a dynamic-segment change, pages don't. This is deliberate: pagefind-modal and
// pagefind-modal-trigger below pair themselves up via generated IDs (aria-controls on the
// trigger's button, matched against the modal dialog's own id) the first time each connects to
// the DOM, and that pairing does not survive being torn down and recreated -- a second mount
// within the same document leaves the trigger pointing at a dialog id that no longer exists, so
// clicking it silently does nothing (no console error). Rendering both from a layout instead of
// the page means they mount exactly once per docs session (only a real page load, i.e. a fresh
// document, resets that), regardless of how many times the reader navigates between docs. See
// DocsArticle.tsx for the per-doc content (article + TOC) that's supposed to remount each time.
const DocsShell: React.FC<DocsShellProps> = ({ docsMeta, children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startNavigation] = useTransition();
  usePagefindComponentUI();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // null means "not yet measured" (no window on the server, client hasn't measured yet) --
  // same three-state convention useIsPhone()/useViewport() use elsewhere in this app. Rendering
  // the desktop layout as a default guess until the real width is known would flash it on every
  // phone load right before snapping to compact; gating the render below on this instead avoids
  // that.
  const [compact, setCompact] = useState<boolean | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // Stays true through the close animation so <pagefind-input> and <pagefind-results> (the
  // full-bleed results panel) have something to animate out -- searchOpen alone flips instantly,
  // which would unmount them before any CSS transition could play. See the onTransitionEnd
  // handler below for where this actually becomes false.
  const [searchMounted, setSearchMounted] = useState(false);
  // .mobileSearchResults is position: fixed (see DocsShell.module.scss) so it isn't clipped by
  // any scrolling ancestor, which means it can't just say "top: 100%" of its own row -- it needs
  // the compact bar's actual bottom edge in viewport coordinates. Re-measured fresh each time
  // search opens rather than continuously tracked, since the results panel visually covers the
  // article underneath while open, so nothing scrolls behind it that would move this in the
  // meantime.
  const [compactBarBottom, setCompactBarBottom] = useState(0);
  const sidebarToggleBtnRef = useRef<HTMLButtonElement>(null);
  const wasSidebarOpenRef = useRef(false);
  const compactBarRef = useRef<HTMLDivElement>(null);
  const compactSearchWrapperRef = useRef<HTMLDivElement>(null);

  // The compact drawer is only ever transform: translateX()'d off-screen, not unmounted, so
  // without `inert` its links stay tab-reachable and screen-reader-visible while "closed".
  // Moving focus back to the button that opened it (rather than leaving it on whatever drawer
  // link had focus, which is about to go inert) keeps keyboard/AT navigation coherent.
  useEffect(() => {
    if (wasSidebarOpenRef.current && !sidebarOpen) {
      sidebarToggleBtnRef.current?.focus();
    }
    wasSidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    const checkBreakpoint = () => {
      setCompact((prev) => {
        const next = window.innerWidth < TABLET_BREAKPOINT;
        // .compactBar (the only place mobile search lives) is display: none whenever !compact --
        // if search was open, closing it the normal animated way is impossible from here on:
        // .compactSearchWrapper's flex-grow transition can never fire on a display: none
        // ancestor, so handleSearchTransitionEnd would never unmount it, leaving
        // .mobileSearchResults (position: fixed, covers the whole page) stuck open with no
        // visible close button. Hard-reset both states immediately instead -- there's nothing to
        // animate against once the bar itself has vanished anyway.
        if (prev && !next) {
          setSearchOpen(false);
          setSearchMounted(false);
        }
        return next;
      });
    };
    checkBreakpoint();
    window.addEventListener("resize", checkBreakpoint);
    return () => window.removeEventListener("resize", checkBreakpoint);
  }, []);

  // Keeps .mobileSearchResults's top offset in sync with the compact bar's real position while
  // search is open -- compactBarBottom is otherwise only measured once, at the moment search
  // opens (see openSearch below), so without this a resize during an open search session (e.g.
  // a mobile browser's address bar showing/hiding) would leave the results panel's top edge
  // wrong until the next open/close.
  useEffect(() => {
    if (!searchOpen) return;
    const updateCompactBarBottom = () => {
      const bar = compactBarRef.current;
      if (bar) setCompactBarBottom(bar.getBoundingClientRect().bottom);
    };
    window.addEventListener("resize", updateCompactBarBottom);
    return () => window.removeEventListener("resize", updateCompactBarBottom);
  }, [searchOpen]);

  // Closes any drawer/search session left open from the previous doc whenever navigation lands
  // on a new one -- covers every path a new slug can arrive by (sidebar click, browser back/
  // forward), not just the sidebar link's own onClick.
  useEffect(() => {
    setSidebarOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Measures the compact bar's own bottom edge right as search opens, in viewport coordinates --
  // see compactBarBottom's own comment above for why the full-bleed results panel needs this
  // rather than a plain CSS "top: 100%".
  const openSearch = useCallback(() => {
    setSearchMounted(true);
    setSearchOpen(true);
    const bar = compactBarRef.current;
    if (bar) setCompactBarBottom(bar.getBoundingClientRect().bottom);
  }, []);

  // INVARIANT: only ever used on <pagefind-input>, never on pagefind-modal-trigger or
  // pagefind-searchbox -- confirmed in the shipped pagefind-component-ui.js, all custom elements
  // here share one base class whose attributeChangedCallback does a blanket
  // `this[camelCaseName] = newValue` for *any* attribute change after the element's initial
  // construction (guarded only by an `_initialized` flag, not by whether that property is
  // actually settable). pagefind-modal-trigger and pagefind-searchbox both additionally define
  // `placeholder` as a getter-only accessor (`get placeholder(){ return this._userPlaceholder ||
  // ... }`) -- for those two, ANY later change to the "placeholder" attribute crashes
  // ("Cannot set property placeholder of #<He> which has only a getter"), regardless of what
  // triggers the change: React re-rendering the prop (the original bug, e.g. the resize-driven
  // re-render a phone rotation causes), or even this exact setAttribute call from a ref. Their
  // own initial construction path avoids it (writes to `_userPlaceholder` instead), which is why
  // a placeholder baked into the very first server-rendered HTML can appear to work -- but
  // there's no reliable way to guarantee nothing ever re-touches that attribute afterward, so
  // pagefind-modal-trigger's own JSX below sets no placeholder at all, full stop.
  // pagefind-input has no such getter (its readAttributes() writes straight to `this.placeholder`
  // as a plain field), so it's the one place this is actually safe.
  const setPagefindPlaceholder = useCallback((el: HTMLElement | null) => {
    el?.setAttribute("placeholder", "Search docs");
  }, []);

  // pagefind-input's own autofocus attribute isn't reliable here -- it's read once when the
  // custom element's internal <input> is first constructed, which can race with the
  // flex-grow/opacity transition that's still animating .compactSearchWrapper open at that
  // moment. Queried by ref rather than a global document.querySelector, since <pagefind-modal>
  // (always mounted, for the sidebar trigger) contains its own internal pagefind-input too, and a
  // global query could focus that one instead.
  //
  // INVARIANT: retries across a few animation frames rather than focusing once. <pagefind-input>
  // is a custom element that builds its own internal <input> in its connectedCallback -- that's
  // usually synchronous with this component's own commit, but isn't guaranteed to be, so a single
  // immediate query can run before the input exists yet. Bails out once searchOpen flips back off
  // (closed again before the input ever appeared) so a stale focus doesn't land after the fact.
  useEffect(() => {
    if (!searchOpen) return;
    let frame = 0;
    let attempts = 0;
    const tryFocus = () => {
      const input = compactSearchWrapperRef.current?.querySelector<HTMLInputElement>("input");
      if (input) {
        input.focus();
        return;
      }
      attempts += 1;
      if (attempts < 10) frame = requestAnimationFrame(tryFocus);
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  // Only flips searchOpen -- searchMounted (and therefore <pagefind-input>/<pagefind-results>
  // themselves) stays true until handleSearchTransitionEnd below sees the collapse animation
  // actually finish, so there's something on screen for that animation to play against.
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  // .compactSearchWrapper's own flex-grow transition is what "the collapse animation finishing"
  // means here -- other properties (opacity) share the same duration, so gating on this one
  // property is enough to fire exactly once per close, not once per animated property.
  const handleSearchTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget || event.propertyName !== "flex-grow") return;
      if (!searchOpen) setSearchMounted(false);
    },
    [searchOpen]
  );

  // The pathname effect above only closes search on a real doc-to-doc navigation -- a result
  // link to the doc already open, or a same-page anchor within it, never changes the pathname,
  // so without this the results panel would stay open (and cover the article) even after the
  // reader picked a result. Delegated on the wrapper rather than per-result, since
  // pagefind-results renders its own result links internally.
  const handleMobileResultsClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest("a")) closeSearch();
    },
    [closeSearch]
  );

  const groups = useMemo(() => buildGroups(docsMeta), [docsMeta]);
  const activeMeta = useMemo(
    () => docsMeta.find((doc) => docHref(doc.slug) === pathname),
    [docsMeta, pathname]
  );

  // Doc links stay real <Link>s (href for prefetch/right-click/open-in-new-tab), but the click
  // is intercepted so the resulting navigation runs inside a transition -- isNavigating from
  // that transition is the one signal TopLoadingBar needs, regardless of which link triggered
  // it. Only for a plain left-click, though -- a modified or non-primary click (Cmd/Ctrl-click,
  // Shift-click, middle-click) is the browser's own "open in new tab/window" gesture, which this
  // must not swallow.
  const navigateToDoc = (event: React.MouseEvent, href: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    setSidebarOpen(false);
    startNavigation(() => {
      router.push(href);
    });
  };

  // See compact's own state comment above -- render nothing until it's measured, same as
  // AppNavbar's isPhone === null guard.
  if (compact === null) {
    return null;
  }

  return (
    <div className={styles.page}>
      <TopLoadingBar active={isNavigating} />
      {/* Single instance for the whole docs session -- pagefind-modal-trigger (in the sidebar
          below) and this connect automatically by sharing Pagefind's default "instance". Both
          live here, in the layout-rendered shell, specifically so they never remount -- see this
          component's own comment above. */}
      <pagefind-modal reset-on-close="true" />
      <div ref={compactBarRef} className={`${styles.compactBar} ${compact ? styles.isCompact : ""}`}>
        {/* Panel-toggle + breadcrumb animate out together as search opens, freeing the whole bar
            (not just the breadcrumb's own space) for the searchbox -- see .compactBarChrome. */}
        <div className={styles.compactBarChrome} data-hidden={searchOpen}>
          <button
            ref={sidebarToggleBtnRef}
            type="button"
            className={styles.sidebarIconBtn}
            aria-label="Open contents"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelToggleIcon />
          </button>
          <span className={styles.breadcrumbGroup}>{activeMeta?.group}</span>
          <span className={styles.breadcrumbGroup}>/</span>
          <span className={styles.breadcrumbTitle}>{activeMeta?.title}</span>
        </div>
        {/* pagefind-input, not pagefind-searchbox -- decoupled from its own attached dropdown on
            purpose, since that dropdown is deeply, deliberately hard to restyle (Pagefind wraps
            its base rule in a 3x :is(*, #\#) specificity-boosting selector). pagefind-results
            below, connected only by the shared instance="mobile-search" attribute, renders as a
            plain in-flow block with none of that -- see .mobileSearchResults's own comment.
            searchMounted (not searchOpen) gates the actual element so closing has something to
            animate out before unmounting -- see handleSearchTransitionEnd. */}
        <div
          ref={compactSearchWrapperRef}
          className={styles.compactSearchWrapper}
          data-open={searchOpen}
          onTransitionEnd={handleSearchTransitionEnd}
        >
          {searchMounted && (
            <pagefind-input ref={setPagefindPlaceholder} instance="mobile-search" autofocus="true" />
          )}
        </div>
        <button
          type="button"
          className={styles.sidebarIconBtn}
          aria-label={searchOpen ? "Close search" : "Search docs"}
          onClick={searchOpen ? closeSearch : openSearch}
        >
          {searchOpen ? <CloseIcon size={20} /> : <SearchIcon size={20} />}
        </button>
      </div>

      {compact && sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      <div className={styles.columns}>
        <nav
          inert={compact && !sidebarOpen}
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
          {/* No placeholder here -- see setPagefindPlaceholder's own comment above for why
              pagefind-modal-trigger specifically can't have one set at all, ever, by any method.
              Falls back to Pagefind's own default trigger text. */}
          {!compact && (
            <pagefind-modal-trigger className={styles.sidebarSearchTrigger} hide-shortcut="true" />
          )}
          {groups.map((group) => (
            <React.Fragment key={group.name}>
              <div className={styles.groupLabel}>{group.name}</div>
              {group.docs.map((doc) => (
                <Link
                  key={doc.slug}
                  href={docHref(doc.slug)}
                  className={`${styles.docLink} ${doc.slug === activeMeta?.slug ? styles.isActive : ""}`}
                  onClick={(event) => navigateToDoc(event, docHref(doc.slug))}
                >
                  {doc.title}
                </Link>
              ))}
            </React.Fragment>
          ))}
        </nav>

        {children}
      </div>

      {/* Renders over .columns (not inside it) while mobile search is open, filling the exact
          same content area .columns occupies -- see compactBarBottom's own comment for why the
          top offset is measured rather than assumed, and .mobileSearchResults for the rest. */}
      {searchMounted && (
        <div
          className={styles.mobileSearchResults}
          data-open={searchOpen}
          style={{ "--docs-compact-bar-bottom": `${compactBarBottom}px` } as React.CSSProperties}
          onClick={handleMobileResultsClick}
        >
          {/* No hide-sub-results attribute -- pagefind-results shows sub-results by default
              (confirmed against the shipped bundle's own attribute list: show-images,
              hide-sub-results, max-sub-results, max-results, link-target -- there is no
              show-sub-results attribute on this element, unlike pagefind-searchbox). */}
          <pagefind-results instance="mobile-search" />
        </div>
      )}
    </div>
  );
};

export default DocsShell;
