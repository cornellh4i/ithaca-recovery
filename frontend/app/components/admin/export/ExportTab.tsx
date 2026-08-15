"use client";

import React, { useEffect, useState } from "react";
import Icon from "../../ui/displays/Icon";
import type { ILeaseSettings } from "../../../../types/models";
import { ALL_MEETING_EXPORT_FIELD_KEYS, type MeetingExportFieldKey } from "../../../../util/meetings/meetingExportFields";
import type { LeaseYearCycle } from "../../../../util/lease/leaseYearCycles";
import Card from "../shared/Card";
import CardHeader from "../shared/CardHeader";
import MeetingExportConfigModal from "./MeetingExportConfigModal";
import LeaseConfigModal from "./LeaseConfigModal";
import { useToast } from "../../shared/ToastProvider";
import styles from "./ExportTab.module.scss";

type ExportKind = "meetings" | "lease";

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

const ExportTab: React.FC = () => {
  const { showToast } = useToast();
  const [leaseSettings, setLeaseSettings] = useState<ILeaseSettings | null>(null);
  const [leaseCycles, setLeaseCycles] = useState<LeaseYearCycle[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [downloading, setDownloading] = useState<ExportKind | null>(null);
  const [downloaded, setDownloaded] = useState<ExportKind | null>(null);
  const [meetingExportFields, setMeetingExportFields] = useState<MeetingExportFieldKey[] | null>(null);
  const [meetingExportTotal, setMeetingExportTotal] = useState(0);
  const [meetingConfigOpen, setMeetingConfigOpen] = useState(false);

  const loadLeaseSettings = async (isCancelled: () => boolean) => {
    try {
      const response = await fetch("/api/retrieve/lease-settings");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { settings: ILeaseSettings; cycles: LeaseYearCycle[] } = await response.json();
      if (isCancelled()) return;
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
    } catch (err) {
      if (isCancelled()) return;
      console.error("Error loading lease settings:", err);
      showToast({ variant: "error", title: "Failed to load lease settings.", persistent: true });
    }
  };

  const loadMeetingExportSettings = async (isCancelled: () => boolean) => {
    try {
      const response = await fetch("/api/retrieve/meeting-export-settings");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const json: { fields: MeetingExportFieldKey[]; total: number } = await response.json();
      if (isCancelled()) return;
      setMeetingExportFields(json.fields);
      setMeetingExportTotal(json.total);
    } catch (err) {
      if (isCancelled()) return;
      console.error("Error loading meeting export settings:", err);
      showToast({ variant: "error", title: "Failed to load export field settings.", persistent: true });
    }
  };

  useEffect(() => {
    // Async fetch-then-set; the lint rule can't see the setState calls sit after an
    // await, so this is a false positive for the standard "load on mount" pattern.
    /* eslint-disable react-hooks/set-state-in-effect */
    let cancelled = false;
    const isCancelled = () => cancelled;
    loadLeaseSettings(isCancelled);
    loadMeetingExportSettings(isCancelled);
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleExport = async (kind: ExportKind) => {
    setDownloading(kind);
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
      showToast({
        variant: "error",
        title: err instanceof Error ? err.message : "Export failed.",
        persistent: true,
      });
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
      showToast({ variant: "error", title: json.error ?? "Failed to save lease settings." });
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
        showToast({ variant: "error", title: json.error ?? "Failed to save export field settings." });
        return;
      }
      const saved: { fields: MeetingExportFieldKey[] } = await response.json();
      setMeetingExportFields(saved.fields);
      setMeetingConfigOpen(false);
    } catch (err) {
      console.error("Error saving meeting export settings:", err);
      showToast({ variant: "error", title: "Failed to save export field settings." });
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
      <div className={styles.grid}>
        <Card className={styles.exportCard}>
          <CardHeader
            icon={<Icon name="backup" />}
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
            icon={<Icon name="description" />}
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
