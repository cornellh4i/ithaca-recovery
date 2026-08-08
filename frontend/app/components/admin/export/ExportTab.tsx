"use client";

import React, { useEffect, useMemo, useState } from "react";
import BackupIcon from "@mui/icons-material/Backup";
import DescriptionIcon from "@mui/icons-material/Description";
import TvIcon from "@mui/icons-material/Tv";
import {
  SIGNAGE_CAL_TYPES,
  SIGNAGE_MODE_TYPES,
  SIGNAGE_ROOM_SLUGS,
  SIGNAGE_ZOOM_SLUGS,
} from "../../../../util/signageFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, CATEGORY_COLOR } from "../../../../util/rooms/filterColors";
import type { ILeaseSettings } from "../../../../types/models";
import { ALL_MEETING_EXPORT_FIELD_KEYS, type MeetingExportFieldKey } from "../../../../util/meetingExportFields";
import type { LeaseYearCycle } from "../../../../util/lease/leaseYearCycles";
import FilterGroup, { FilterGroupItem } from "../../shared/FilterGroup";
import Card from "../shared/Card";
import CardHeader from "../shared/CardHeader";
import MeetingExportConfigModal from "./MeetingExportConfigModal";
import LeaseConfigModal from "./LeaseConfigModal";
import styles from "../../../../styles/components/admin/ExportTab.module.scss";

type ExportKind = "meetings" | "lease";

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

const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

function formatDateShort(value: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(value));
}

async function downloadExport(url: string, fallbackFilename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json.error ?? "Export failed.");
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename;
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

const SignageUrlCard: React.FC = () => {
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
  );
};

const ExportTab: React.FC = () => {
  const [leaseSettings, setLeaseSettings] = useState<ILeaseSettings | null>(null);
  const [leaseCycles, setLeaseCycles] = useState<LeaseYearCycle[]>([]);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [downloading, setDownloading] = useState<ExportKind | null>(null);
  const [downloaded, setDownloaded] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [meetingExportFields, setMeetingExportFields] = useState<MeetingExportFieldKey[] | null>(null);
  const [meetingExportTotal, setMeetingExportTotal] = useState(0);
  const [meetingSettingsError, setMeetingSettingsError] = useState<string | null>(null);
  const [meetingConfigOpen, setMeetingConfigOpen] = useState(false);

  const loadLeaseSettings = async () => {
    try {
      const response = await fetch("/api/retrieve/lease-settings");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { settings: ILeaseSettings; cycles: LeaseYearCycle[] } = await response.json();
      setLeaseSettings(json.settings);
      // fetch/JSON.parse hands back ISO strings for Date fields despite the LeaseYearCycle type,
      // so callers comparing against `new Date(...)` values (LeaseConfigModal's cycle picker) need real Dates here.
      setLeaseCycles(
        json.cycles.map((cycle) => ({
          ...cycle,
          startDate: new Date(cycle.startDate),
          endDate: new Date(cycle.endDate),
        })),
      );
      setSettingsError(null);
    } catch (err) {
      console.error("Error loading lease settings:", err);
      setSettingsError("Failed to load lease settings.");
    }
  };

  const loadMeetingExportSettings = async () => {
    try {
      const response = await fetch("/api/retrieve/meeting-export-settings");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { fields: MeetingExportFieldKey[]; total: number } = await response.json();
      setMeetingExportFields(json.fields);
      setMeetingExportTotal(json.total);
      setMeetingSettingsError(null);
    } catch (err) {
      console.error("Error loading meeting export settings:", err);
      setMeetingSettingsError("Failed to load export field settings.");
    }
  };

  useEffect(() => {
    // Async fetch-then-set; the lint rule can't see the setState calls sit after an
    // await, so this is a false positive for the standard "load on mount" pattern.
    /* eslint-disable react-hooks/set-state-in-effect */
    loadLeaseSettings();
    loadMeetingExportSettings();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleExport = async (kind: ExportKind) => {
    setDownloading(kind);
    setExportError(null);
    try {
      if (kind === "meetings") {
        await downloadExport("/api/export/meetings", `ithaca-recovery-meetings-${todayISO()}.xlsx`);
      } else {
        await downloadExport("/api/export/lease", "Bulk Send Lease.csv");
      }
      setDownloaded(kind);
      setTimeout(() => setDownloaded((curr) => (curr === kind ? null : curr)), 1800);
    } catch (err) {
      console.error(`Error exporting ${kind}:`, err);
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setDownloading(null);
    }
  };

  const handleSaveSettings = async (next: ILeaseSettings) => {
    const response = await fetch("/api/update/lease-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      alert(json.error ?? "Failed to save lease settings.");
      return;
    }
    const saved: ILeaseSettings = await response.json();
    setLeaseSettings(saved);
    setConfigOpen(false);
  };

  const handleSaveMeetingExportFields = async (fields: MeetingExportFieldKey[]) => {
    try {
      const response = await fetch("/api/update/meeting-export-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        alert(json.error ?? "Failed to save export field settings.");
        return;
      }
      const saved: { fields: MeetingExportFieldKey[] } = await response.json();
      setMeetingExportFields(saved.fields);
      setMeetingConfigOpen(false);
    } catch (err) {
      console.error("Error saving meeting export settings:", err);
      alert("Failed to save export field settings.");
    }
  };

  const meetingsFilename = `ithaca-recovery-meetings-${todayISO()}.xlsx`;
  const leaseFilename = leaseSettings
    ? `${new Date(leaseSettings.leaseStartDate).getUTCFullYear()} - ${new Date(leaseSettings.leaseEndDate).getUTCFullYear()} Bulk Send Lease.csv`
    : "Bulk Send Lease.csv";
  const leaseSummary = leaseSettings
    ? `Currently: ${formatDateShort(leaseSettings.leaseStartDate)} – ${formatDateShort(leaseSettings.leaseEndDate)} · ${leaseSettings.rooms.length} room rates configured`
    : "Loading settings…";
  const meetingExportSummary = meetingExportFields
    ? `Currently: ${meetingExportTotal} meetings · ${meetingExportFields.length} of ${ALL_MEETING_EXPORT_FIELD_KEYS.length} fields`
    : "Loading settings…";

  return (
    <div className={styles.container}>
      {exportError && <div className={styles.errorBanner}>{exportError}</div>}
      {settingsError && <div className={styles.errorBanner}>{settingsError}</div>}
      {meetingSettingsError && <div className={styles.errorBanner}>{meetingSettingsError}</div>}

      <div className={styles.grid}>
        <Card className={styles.exportCard}>
          <CardHeader
            icon={<BackupIcon />}
            title="Export Meetings (XLSX)"
            action={{
              label: "Configure",
              onClick: () => setMeetingConfigOpen(true),
              ariaLabel: "Configure export fields",
              title: "Configure export fields…",
              disabled: !meetingExportFields,
            }}
          />
          <div className={styles.cardDesc}>
            Spreadsheet export of every meeting. Configure which fields to include.
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryText}>{meetingExportSummary}</span>
          </div>
          <div className={styles.cardFooter}>
            <div className={styles.filename}>{meetingsFilename}</div>
            <button
              className={styles.exportButton}
              onClick={() => handleExport("meetings")}
              disabled={downloading === "meetings"}
            >
              {downloaded === "meetings" ? "Downloaded ✓" : downloading === "meetings" ? "Exporting…" : "Export Meetings"}
            </button>
          </div>
        </Card>

        <Card className={styles.exportCard}>
          <CardHeader
            icon={<DescriptionIcon />}
            title="Export PandaDocs Lease (CSV)"
            action={{
              label: "Configure",
              onClick: () => setConfigOpen(true),
              ariaLabel: "Configure export",
              title: "Configure export…",
              disabled: !leaseSettings,
            }}
          />
          <div className={styles.cardDesc}>
            Billing fields formatted for the PandaDocs lease-renewal mail merge.
            Include room rate, billable time, rent charge, and client contact per group.
          </div>
          {leaseSettings && (
            <div className={styles.summaryRow}>
              <span className={styles.summaryText}>{leaseSummary}</span>
              <button className={styles.viewRatesButton} onClick={() => setRatesOpen((v) => !v)}>
                View rates
              </button>
              {ratesOpen && (
                <div className={styles.ratesPopover}>
                  {leaseSettings.rooms.map((room) => (
                    <div key={room.room} className={styles.ratesPopoverRow}>
                      <span>{room.room}</span>
                      <span>${room.rate}/{room.unit}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className={styles.cardFooter}>
            <div className={styles.filename}>{leaseFilename}</div>
            <button
              className={styles.exportButton}
              onClick={() => handleExport("lease")}
              disabled={downloading === "lease" || !leaseSettings}
            >
              {downloaded === "lease" ? "Downloaded ✓" : downloading === "lease" ? "Exporting…" : "Export Lease CSV"}
            </button>
          </div>
        </Card>
      </div>

      <SignageUrlCard />

      {configOpen && leaseSettings && (
        <LeaseConfigModal
          initial={leaseSettings}
          cycles={leaseCycles}
          onCancel={() => setConfigOpen(false)}
          onSave={handleSaveSettings}
        />
      )}

      {meetingConfigOpen && meetingExportFields && (
        <MeetingExportConfigModal
          initialFields={meetingExportFields}
          onCancel={() => setMeetingConfigOpen(false)}
          onSave={handleSaveMeetingExportFields}
        />
      )}
    </div>
  );
};

export default ExportTab;
