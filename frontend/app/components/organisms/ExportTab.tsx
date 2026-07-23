"use client";

import React, { useEffect, useMemo, useState } from "react";
import BackupIcon from "@mui/icons-material/Backup";
import DescriptionIcon from "@mui/icons-material/Description";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import TvIcon from "@mui/icons-material/Tv";
import {
  SIGNAGE_CAL_TYPES,
  SIGNAGE_MODE_TYPES,
  SIGNAGE_ROOM_SLUGS,
  SIGNAGE_ZOOM_SLUGS,
} from "../../../util/signageFilters";
import { ROOM_COLORS, ZOOM_ROOM_COLOR, CATEGORY_COLOR } from "../../../util/filterColors";
import type { ILeaseSettings, IRoomRate } from "../../../util/models";
import FilterGroup, { FilterGroupItem } from "../molecules/FilterGroup";
import CardHeader from "../molecules/CardHeader";
import styles from "../../../styles/components/organisms/ExportTab.module.scss";

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

function toDateInputValue(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
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

interface LeaseConfigModalProps {
  initial: ILeaseSettings;
  onCancel: () => void;
  onSave: (next: ILeaseSettings) => Promise<void>;
}

const LeaseConfigModal: React.FC<LeaseConfigModalProps> = ({ initial, onCancel, onSave }) => {
  const [draft, setDraft] = useState<ILeaseSettings>(initial);
  const [saving, setSaving] = useState(false);

  const dateError = new Date(draft.leaseStartDate) >= new Date(draft.leaseEndDate)
    ? "Lease start date must be before the end date."
    : null;

  const updateRoom = (index: number, patch: Partial<IRoomRate>) => {
    setDraft((prev) => ({
      ...prev,
      rooms: prev.rooms.map((room, i) => (i === index ? { ...room, ...patch } : room)),
    }));
  };

  const handleSave = async () => {
    if (dateError) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>Configure PandaDocs lease export</h3>
        <p className={styles.modalIntro}>
          These settings control the lease period, rates, rental agent contact, and email wording used when
          generating the export. Per-meeting details (group name, contact email, schedule) always come from the
          meeting itself and aren&apos;t set here.
        </p>

        <div className={styles.sectionLabel}>Lease period</div>
        <div className={styles.dateRow}>
          <label className={styles.fieldLabel}>
            Start
            <input
              type="date"
              className={styles.input}
              value={toDateInputValue(draft.leaseStartDate)}
              onChange={(e) => setDraft((prev) => ({ ...prev, leaseStartDate: new Date(`${e.target.value}T00:00:00Z`) }))}
            />
          </label>
          <label className={styles.fieldLabel}>
            End
            <input
              type="date"
              className={styles.input}
              value={toDateInputValue(draft.leaseEndDate)}
              onChange={(e) => setDraft((prev) => ({ ...prev, leaseEndDate: new Date(`${e.target.value}T00:00:00Z`) }))}
            />
          </label>
        </div>
        {dateError && <p className={styles.dateError}>{dateError}</p>}

        <div className={styles.sectionLabel}>Rooms &amp; rates</div>
        <table className={styles.ratesTable}>
          <thead>
            <tr>
              <th>Room / Zoom account</th>
              <th>Rate</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {draft.rooms.map((room, i) => (
              <tr key={room.room}>
                <td>{room.room}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={styles.rateInput}
                    value={room.rate}
                    onChange={(e) => updateRoom(i, { rate: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <select
                    className={styles.input}
                    value={room.unit}
                    onChange={(e) => updateRoom(i, { unit: e.target.value as IRoomRate["unit"] })}
                  >
                    <option value="hr">/hr</option>
                    <option value="month">/month</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.sectionLabel}>Rental agent contact</div>
        <p className={styles.fieldHint}>Printed on every lease as the ICR contact — update when staff changes.</p>
        <div className={styles.contactGrid}>
          <label className={styles.fieldLabel}>
            First name
            <input className={styles.input} value={draft.agentFirstName} onChange={(e) => setDraft((p) => ({ ...p, agentFirstName: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            Last name
            <input className={styles.input} value={draft.agentLastName} onChange={(e) => setDraft((p) => ({ ...p, agentLastName: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            Title
            <input className={styles.input} value={draft.agentTitle} onChange={(e) => setDraft((p) => ({ ...p, agentTitle: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            Email
            <input className={styles.input} value={draft.agentEmail} onChange={(e) => setDraft((p) => ({ ...p, agentEmail: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            Phone
            <input className={styles.input} value={draft.agentPhone} onChange={(e) => setDraft((p) => ({ ...p, agentPhone: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            Street address
            <input className={styles.input} value={draft.agentStreetAddress} onChange={(e) => setDraft((p) => ({ ...p, agentStreetAddress: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            City
            <input className={styles.input} value={draft.agentCity} onChange={(e) => setDraft((p) => ({ ...p, agentCity: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            State
            <input className={styles.input} value={draft.agentState} onChange={(e) => setDraft((p) => ({ ...p, agentState: e.target.value }))} />
          </label>
          <label className={styles.fieldLabel}>
            ZIP
            <input className={styles.input} value={draft.agentZip} onChange={(e) => setDraft((p) => ({ ...p, agentZip: e.target.value }))} />
          </label>
        </div>

        <div className={styles.sectionLabel}>Email message template</div>
        <textarea
          className={styles.textarea}
          rows={5}
          value={draft.emailTemplate}
          onChange={(e) => setDraft((p) => ({ ...p, emailTemplate: e.target.value }))}
        />
        <p className={styles.fieldHint}>
          Sent with every lease. <code className={styles.code}>{"{group}"}</code> is replaced with each group&apos;s name.
        </p>

        <div className={styles.modalActions}>
          <button className={styles.cancelButton} onClick={onCancel} disabled={saving}>Cancel</button>
          <button className={styles.saveButton} onClick={handleSave} disabled={saving || !!dateError}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

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
    <div className={styles.card}>
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
    </div>
  );
};

const ExportTab: React.FC = () => {
  const [leaseSettings, setLeaseSettings] = useState<ILeaseSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [downloading, setDownloading] = useState<ExportKind | null>(null);
  const [downloaded, setDownloaded] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadLeaseSettings = async () => {
    try {
      const response = await fetch("/api/retrieve/lease-settings");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: ILeaseSettings = await response.json();
      setLeaseSettings(json);
      setSettingsError(null);
    } catch (err) {
      console.error("Error loading lease settings:", err);
      setSettingsError("Failed to load lease settings.");
    }
  };

  useEffect(() => {
    // Async fetch-then-set; the lint rule can't see the setState calls sit after an
    // await, so this is a false positive for the standard "load on mount" pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeaseSettings();
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

  const meetingsFilename = `ithaca-recovery-meetings-${todayISO()}.xlsx`;
  const leaseFilename = leaseSettings
    ? `${new Date(leaseSettings.leaseStartDate).getUTCFullYear()} - ${new Date(leaseSettings.leaseEndDate).getUTCFullYear()} Bulk Send Lease.csv`
    : "Bulk Send Lease.csv";
  const leaseSummary = leaseSettings
    ? `Currently: ${formatDateShort(leaseSettings.leaseStartDate)} – ${formatDateShort(leaseSettings.leaseEndDate)} · ${leaseSettings.rooms.length} room rates configured`
    : "Loading settings…";

  return (
    <div className={styles.container}>
      {exportError && <div className={styles.errorBanner}>{exportError}</div>}
      {settingsError && <div className={styles.errorBanner}>{settingsError}</div>}

      <div className={styles.grid}>
        <div className={`${styles.card} ${styles.exportCard}`}>
          <CardHeader icon={<BackupIcon />} title="Export Meetings (XLSX)" />
          <div className={styles.cardDesc}>
            Full backup of every meeting. Include meeting mode, room, contact, and schedule fields.
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
        </div>

        <div className={`${styles.card} ${styles.exportCard}`}>
          <CardHeader
            icon={<DescriptionIcon />}
            title="Export PandaDocs Lease (CSV)"
            action={{
              icon: <MoreVertIcon fontSize="small" />,
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
        </div>
      </div>

      <SignageUrlCard />

      {configOpen && leaseSettings && (
        <LeaseConfigModal
          initial={leaseSettings}
          onCancel={() => setConfigOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
};

export default ExportTab;
