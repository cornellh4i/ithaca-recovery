"use client";

import React, { useEffect, useMemo, useState } from "react";
import TvIcon from "@mui/icons-material/Tv";
import {
  SIGNAGE_CAL_TYPES,
  SIGNAGE_MODE_TYPES,
  SIGNAGE_ROOM_SLUGS,
  SIGNAGE_ZOOM_SLUGS,
} from "../../../../util/filters/signageFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, CATEGORY_COLOR } from "../../../../util/rooms/filterColors";
import FilterGroup, { FilterGroupItem } from "../../shared/FilterGroup";
import Card from "../shared/Card";
import CardHeader from "../shared/CardHeader";
import styles from "./SignageTab.module.scss";

const LOCATION_ROOMS = Object.keys(SIGNAGE_ROOM_SLUGS);
const ZOOM_ROOMS = Object.keys(SIGNAGE_ZOOM_SLUGS);

const LOCATION_ITEMS: FilterGroupItem[] = LOCATION_ROOMS.map((name) => ({
  key: name,
  label: name,
  color: ROOM_COLORS[name],
}));
const ZOOM_ITEMS: FilterGroupItem[] = ZOOM_ROOMS.map((name) => ({
  key: name,
  label: name,
  color: ZOOM_ROOM_COLOR,
}));
const CAL_TYPE_ITEMS: FilterGroupItem[] = SIGNAGE_CAL_TYPES.map((name) => ({
  key: name,
  label: name,
  color: CATEGORY_COLOR,
}));
const MODE_ITEMS: FilterGroupItem[] = SIGNAGE_MODE_TYPES.map((name) => ({
  key: name,
  label: name,
  color: CATEGORY_COLOR,
}));

const allChecked = (names: string[]): Record<string, boolean> =>
  Object.fromEntries(names.map((name) => [name, true]));

const SignageTab: React.FC = () => {
  const [checkedRooms, setCheckedRooms] = useState<Record<string, boolean>>(() =>
    allChecked([...LOCATION_ROOMS, ...ZOOM_ROOMS]));
  const [checkedTypes, setCheckedTypes] = useState<Record<string, boolean>>(() => allChecked(SIGNAGE_CAL_TYPES));
  const [checkedModes, setCheckedModes] = useState<Record<string, boolean>>(() => allChecked(SIGNAGE_MODE_TYPES));
  const [view, setView] = useState<"day" | "week">("day");
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  // Effect (not a lazy useState initializer) deliberately: this component is SSR'd, where
  // `window` doesn't exist, so origin must resolve post-hydration to avoid a mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const { generatedUrl, isFullyOpen } = useMemo(() => {
    const buildParam = (
      allNames: string[],
      checked: Record<string, boolean>,
      slugs: Record<string, string> = {},
    ): string | null => {
      const on = allNames.filter((name) => checked[name]);
      if (on.length === allNames.length) return null;
      return on.map((name) => slugs[name] ?? name).join(",");
    };

    const roomsParam = buildParam(LOCATION_ROOMS, checkedRooms, SIGNAGE_ROOM_SLUGS);
    const zoomParam = buildParam(ZOOM_ROOMS, checkedRooms, SIGNAGE_ZOOM_SLUGS);
    const typesParam = buildParam(SIGNAGE_CAL_TYPES, checkedTypes);
    const modesParam = buildParam(SIGNAGE_MODE_TYPES, checkedModes);

    const params = new URLSearchParams();
    if (roomsParam !== null) params.set("rooms", roomsParam);
    if (zoomParam !== null) params.set("zoom", zoomParam);
    if (typesParam !== null) params.set("types", typesParam);
    if (modesParam !== null) params.set("modes", modesParam);
    params.set("view", view);

    return {
      generatedUrl: `${origin}/signage?${params.toString()}`,
      isFullyOpen: roomsParam === null && zoomParam === null && typesParam === null && modesParam === null,
    };
  }, [checkedRooms, checkedTypes, checkedModes, view, origin]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error("Error copying signage link:", err);
    }
  };

  const toggleRoom = (key: string, value: boolean) => setCheckedRooms((prev) => ({ ...prev, [key]: value }));
  const toggleType = (key: string, value: boolean) => setCheckedTypes((prev) => ({ ...prev, [key]: value }));
  const toggleMode = (key: string, value: boolean) => setCheckedModes((prev) => ({ ...prev, [key]: value }));

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader icon={<TvIcon />} title="Generate Signage URL" />
        <div className={styles.cardDesc}>
          Build a filtered link for digital signage display. Pick which locations, calendars, and
          meeting modes it should show, then copy the link into the signage device.
        </div>

        <div className={styles.filterGrid}>
          <FilterGroup title="LOCATION" items={LOCATION_ITEMS} checked={checkedRooms} onToggle={toggleRoom} />
          <FilterGroup title="ZOOM ROOMS" items={ZOOM_ITEMS} checked={checkedRooms} onToggle={toggleRoom} />
          <FilterGroup title="CALENDAR" items={CAL_TYPE_ITEMS} checked={checkedTypes} onToggle={toggleType} />
          <FilterGroup title="MODE" items={MODE_ITEMS} checked={checkedModes} onToggle={toggleMode} />
        </div>

        <div className={styles.sectionLabel}>Display view</div>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewButton} ${view === "day" ? styles.viewButtonActive : ""}`}
            onClick={() => setView("day")}
          >
            Daily
          </button>
          <button
            className={`${styles.viewButton} ${view === "week" ? styles.viewButtonActive : ""}`}
            onClick={() => setView("week")}
          >
            Weekly
          </button>
        </div>

        <div className={styles.sectionLabel}>Generated link</div>
        <div className={styles.linkRow}>
          <input readOnly className={styles.linkField} value={generatedUrl} onFocus={(e) => e.target.select()} />
          <button className={styles.copyButton} onClick={handleCopy}>
            {copied ? "Copied ✓" : "Copy Link"}
          </button>
        </div>
        <div className={styles.linkCaption}>
          {isFullyOpen
            ? "Everything is checked, so this link shows all locations, calendars, and modes — the same as leaving filters off."
            : "Only the checked locations, calendars, and modes will show on this link."}
        </div>
      </Card>
    </div>
  );
};

export default SignageTab;
