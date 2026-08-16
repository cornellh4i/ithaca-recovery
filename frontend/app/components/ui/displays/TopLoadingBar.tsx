import React from "react";
import styles from "./TopLoadingBar.module.scss";

interface TopLoadingBarProps {
  active: boolean;
  /** Accessible name announced by screen readers -- name the resource actually loading. */
  label: string;
}

// A thin sweeping bar along a container's top edge -- signals a background refetch (e.g.
// paging to a new week/range) without dimming or covering the content still on screen. The
// caller's own position: relative container is what anchors this; it's absolutely positioned
// to span that container's full width.
const TopLoadingBar: React.FC<TopLoadingBarProps> = ({ active, label }) => {
  if (!active) return null;

  return (
    <div className={styles.track} role="progressbar" aria-label={label}>
      <div className={styles.fill} />
    </div>
  );
};

export default TopLoadingBar;
