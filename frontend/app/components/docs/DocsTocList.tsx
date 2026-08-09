import React from "react";
import type { TocItem } from "../../../util/docs/parseMarkdown";
import styles from "../../../styles/components/docs/DocsShell.module.scss";

interface TocListProps {
  toc: TocItem[];
  activeSlug: string | null;
  onNavigate?: () => void;
}

const TocList: React.FC<TocListProps> = ({ toc, activeSlug, onNavigate }) => (
  <React.Fragment>
    {toc.map((item) => (
      <a
        key={item.slug}
        href={`#${item.slug}`}
        className={`${styles.tocLink} ${item.level === 1 ? styles.isH1 : styles.isH2} ${
          item.slug === activeSlug ? styles.isCurrent : ""
        }`}
        onClick={onNavigate}
      >
        {item.text}
      </a>
    ))}
  </React.Fragment>
);

export default TocList;
