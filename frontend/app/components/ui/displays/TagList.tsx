import React, { useLayoutEffect, useRef, useState } from "react";
import styles from './TagList.module.scss';
import { sortTags } from '../../../../util/filters/tagOrder';
import { MODE_ICON_NAME } from '../../../../util/rooms/modeIcons';
import Icon from './Icon';

interface TagListProps {
  tags: string[];
  color: string; // background color for tag pills, including the "+N" overflow pill
  gap?: number; // px gap between pills -- also fed into the fit calculation below
  containerStyle?: React.CSSProperties;
  // Merged onto every pill (visible + overflow), for callers whose tag sizing differs from
  // the base look. Values must be plain CSS strings (e.g. '12px', not 12) -- these get
  // assigned straight onto a raw DOM node's style during measurement, which (unlike React)
  // never auto-appends units to bare numbers.
  tagStyle?: React.CSSProperties;
}

const TagList: React.FC<TagListProps> = ({ tags, color, gap = 3, containerStyle, tagStyle }) => {
  const sorted = sortTags(tags);
  const containerRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(sorted.length);
  // JSON-encoded rather than joined -- a plain `sorted.join('|')` would collide for
  // differently-split tag lists that happen to share the same joined text (e.g.
  // ["a|b"] vs ["a", "b"]), silently skipping a needed recompute.
  const sortedKey = JSON.stringify(sorted);
  // Stringified rather than the raw object -- tagStyle/containerStyle are inline object
  // literals at call sites (e.g. BoxText's `compact ? {...} : undefined`, or its
  // `fillHeight`-driven marginTop), so a new reference every render would otherwise
  // re-run this effect constantly instead of only when the actual style values change.
  const tagStyleKey = JSON.stringify(tagStyle ?? {});
  const containerStyleKey = JSON.stringify(containerStyle ?? {});

  // Tags wrap onto as many rows as the surrounding box actually has room for -- e.g. a tall
  // WeekView card can fit 2+ rows, while a short stacked DayView card fits barely one --
  // and only the remainder collapses into a single "+N" pill. Figuring out how many rows
  // fit takes two measurements: (1) how much vertical space is actually available, found by
  // walking up to the nearest ancestor that clips overflow (a fixed-height Meeting Block
  // card) -- callers with no such ancestor (e.g. ViewMeeting's popup, which just grows and
  // scrolls) get an unlimited budget, so tags there never get artificially capped; and (2)
  // how tall N tags actually render once wrapped at the container's real width, tested via
  // an off-screen probe rebuilt with fewer tags (+ a "+N" pill) until it fits the budget.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const probe = probeRef.current;
    if (!container || !probe) return;

    const recompute = () => {
      const containerWidth = container.clientWidth;
      if (containerWidth === 0) return;

      let node = container.parentElement;
      let clipAncestor: HTMLElement | null = null;
      // Stop before document.body/documentElement -- BottomSheet (mobile ViewMeeting's
      // wrapper) toggles document.body.style.overflow = 'hidden' as a scroll-lock while open,
      // which would otherwise get picked up here as a false "clipping ancestor" and cap tags
      // to whatever tiny sliver of body height happens to sit below this row, even though
      // there's plenty of horizontal room and ViewMeeting is meant to get an unlimited budget
      // (see this effect's own comment above).
      while (node && node !== document.body && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'clip' || cs.overflowY === 'clip') {
          clipAncestor = node;
          break;
        }
        node = node.parentElement;
      }
      const availableHeight = clipAncestor
        ? clipAncestor.getBoundingClientRect().bottom - container.getBoundingClientRect().top
        : Infinity;

      probe.style.width = `${containerWidth}px`;
      probe.style.gap = `${gap}px`;

      const heightFor = (visibleTagCount: number, overflowCount: number): number => {
        probe.replaceChildren();
        const addPill = (text: string, isOverflow: boolean) => {
          const span = document.createElement('span');
          span.className = isOverflow ? styles.overflowTag : styles.tag;
          // A plain sized <img> stand-in is enough for this measurement -- .tagIcon's explicit
          // width/height apply regardless of a real src, and the probe never attaches to the
          // visible DOM, so it doesn't need to render the actual icon (img vs. svg) faithfully.
          if (!isOverflow && MODE_ICON_NAME[text]) {
            const icon = document.createElement('img');
            icon.className = styles.tagIcon;
            span.appendChild(icon);
          }
          span.appendChild(document.createTextNode(text));
          if (tagStyle) Object.assign(span.style, tagStyle as Record<string, string>);
          probe.appendChild(span);
        };
        sorted.slice(0, visibleTagCount).forEach(tag => addPill(tag, false));
        if (overflowCount > 0) addPill(`+${overflowCount}`, true);
        return probe.offsetHeight;
      };

      if (heightFor(sorted.length, 0) <= availableHeight) {
        setVisibleCount(sorted.length);
        return;
      }

      for (let count = sorted.length - 1; count >= 1; count--) {
        const overflowCount = sorted.length - count;
        if (heightFor(count, overflowCount) <= availableHeight || count === 1) {
          setVisibleCount(count);
          return;
        }
      }
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedKey, gap, tagStyleKey, containerStyleKey]);

  if (sorted.length === 0) return null;

  const overflowCount = sorted.length - visibleCount;

  return (
    <>
      <div ref={containerRef} className={styles.tags} style={{ gap, ...containerStyle }}>
        {sorted.slice(0, visibleCount).map(tag => (
          <span key={tag} className={styles.tag} style={{ backgroundColor: color, ...tagStyle }}>
            {MODE_ICON_NAME[tag] && <Icon name={MODE_ICON_NAME[tag]} className={styles.tagIcon} />}
            {tag}
          </span>
        ))}
        {overflowCount > 0 && (
          <span className={styles.overflowTag} style={{ backgroundColor: color, ...tagStyle }}>
            +{overflowCount}
          </span>
        )}
      </div>
      <div ref={probeRef} className={styles.measurer} aria-hidden="true" />
    </>
  );
};

export default TagList;
