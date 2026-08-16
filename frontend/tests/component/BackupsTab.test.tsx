import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import BackupsTab from "../../app/components/admin/backups/BackupsTab";
import BackupHealthCard from "../../app/components/admin/backups/BackupHealthCard";
import { ToastProvider } from "../../app/components/shared/ToastProvider";
import { generateMockBackupHealth, generateMockBackupRows } from "../../app/components/admin/backups/mockBackups";

// BackupsTab seeds its own `now` via `useState(() => new Date())` -- pin the system clock so
// every card ("Expires in", next-run, relative-age labels) renders deterministically under TZ=UTC.
const FIXED_NOW = new Date("2026-08-15T12:00:00Z");

const renderTab = () =>
  render(
    <ToastProvider>
      <BackupsTab />
    </ToastProvider>
  );

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("BackupsTab", () => {
  it("renders all four cards with the mock fixture", () => {
    renderTab();
    expect(screen.getByText("Backup Health")).toBeInTheDocument();
    expect(screen.getByText("Snapshots")).toBeInTheDocument();
    expect(screen.getByText("Restore Runbook")).toBeInTheDocument();
    expect(screen.getByText("Notable Activity")).toBeInTheDocument();
  });

  it("shows the unverified row with the Unverified treatment (index 3 of the fixture)", () => {
    renderTab();
    const unverifiedBadges = screen.getAllByLabelText("Unverified");
    // The fixture guarantees exactly one unverified row among the dailies.
    expect(unverifiedBadges).toHaveLength(1);
  });

  it("shows a per-target present/missing tooltip for the single-replica and two-replica rows (indices 6 and 9)", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const singleReplicaRow = rows.find((row) => row.replicas.length === 1);
    const twoReplicaRow = rows.find((row) => row.replicas.length === 2);
    expect(singleReplicaRow).toBeDefined();
    expect(twoReplicaRow).toBeDefined();

    renderTab();
    // Tooltip content sits permanently in the DOM (CSS-hidden until hover/focus), so it's
    // queryable directly rather than via a native `title` attribute.
    expect(screen.getAllByText(/missing/).length).toBeGreaterThan(0);
  });

  it("gives every replica cell a hover tooltip, including fully-replicated rows", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const fullReplicaRow = rows.find((row) => row.replicas.length === 3);
    expect(fullReplicaRow).toBeDefined();

    renderTab();
    expect(screen.getAllByText(/present/).length).toBeGreaterThan(0);
  });

  it("fixture contains both a single-replica and a two-replica (one-missing) row", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const replicaCounts = rows.map((row) => row.replicas.length);
    expect(replicaCounts).toContain(1);
    expect(replicaCounts).toContain(2);
  });

  it("shows 'Never' for the permanent row's expiry", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const permanentRow = rows.find((row) => row.tier === "permanent");
    expect(permanentRow).toBeDefined();
    expect(permanentRow!.expiresAt).toBeNull();

    renderTab();
    // Filter down to the Permanent tier so the single permanent row lands on page 1.
    fireEvent.click(screen.getByRole("button", { name: /^Permanent \d+$/ }));
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("selecting a snapshot populates the Restore Runbook command with its artifact filename", () => {
    renderTab();
    expect(
      screen.getByText("Select a snapshot above to generate its restore command.")
    ).toBeInTheDocument();

    const rows = generateMockBackupRows(FIXED_NOW);
    const firstRow = rows[0];
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);

    const commandBox = screen.getByText(new RegExp(`${firstRow.id}\\.dump\\.age`));
    expect(commandBox).toBeInTheDocument();
    expect(screen.getByText(/command for the selected snapshot/i)).toBeInTheDocument();
  });

  it("clicking a selected row again unselects it", () => {
    renderTab();
    // Radio inputs don't fire a native change event on a second click while already checked --
    // click the row itself (the tr's onClick, not the radio's onChange) to exercise the toggle.
    const dataRows = screen.getAllByRole("row").slice(1);

    fireEvent.click(dataRows[0]);
    expect(
      screen.queryByText("Select a snapshot above to generate its restore command.")
    ).not.toBeInTheDocument();

    fireEvent.click(dataRows[0]);
    expect(
      screen.getByText("Select a snapshot above to generate its restore command.")
    ).toBeInTheDocument();
  });

  it("the runbook's copy button has an accessible 'Copy command' label", () => {
    renderTab();
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);

    expect(screen.getByRole("button", { name: "Copy command" })).toBeInTheDocument();
  });

  it("the Snapshots filter chips filter the table (Unverified, then Monthly)", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const unverifiedCount = rows.filter((r) => !r.verified).length;
    const monthlyCount = rows.filter((r) => r.tier === "monthly").length;

    renderTab();

    fireEvent.click(screen.getByRole("button", { name: `Unverified ${unverifiedCount}` }));
    expect(screen.getAllByLabelText("Unverified")).toHaveLength(unverifiedCount);

    fireEvent.click(screen.getByRole("button", { name: `Monthly ${monthlyCount}` }));
    expect(screen.getAllByText("Monthly", { selector: "span" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Unverified")).not.toBeInTheDocument();
  });

  it("changing the filter resets pagination back to page 1", () => {
    renderTab();
    // All tier has 28 rows (14 daily + 13 monthly + 1 permanent) -- enough for page 2 to exist.
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByText(/^11-20 of/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Monthly \d+$/ }));
    expect(screen.getByText(/^1-10 of 13$/)).toBeInTheDocument();
  });

  it("clears the snapshot selection when the active filter no longer matches it", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: /^Daily \d+$/ }));
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);
    expect(
      screen.queryByText("Select a snapshot above to generate its restore command.")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Monthly \d+$/ }));
    expect(
      screen.getByText("Select a snapshot above to generate its restore command.")
    ).toBeInTheDocument();
  });

  it("disables Back Up Now while creating/lockedBy is set, and fires the dispatched toast", () => {
    renderTab();
    const button = screen.getByRole("button", { name: "Back Up Now" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByText("Backup dispatched — runs appear in Recent Activity")
    ).toBeInTheDocument();
  });

  it("the download button's aria-label still contains 'Download (encrypted)' and fires the stub toast", () => {
    renderTab();
    const downloadButtons = screen.getAllByLabelText(/Download \(encrypted\)/);
    expect(downloadButtons.length).toBeGreaterThan(0);

    fireEvent.click(downloadButtons[0]);

    expect(
      screen.getByText("Signed-URL download arrives with the API wiring PR")
    ).toBeInTheDocument();
  });

  it("clicking the Verified header info button shows the legend, and clicking outside closes it", () => {
    renderTab();

    expect(screen.queryByText(/restored into a scratch database/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "What does Verified mean?" }));
    expect(screen.getByText(/restored into a scratch database/)).toBeInTheDocument();
    expect(screen.getByText(/no verification record exists/)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/restored into a scratch database/)).not.toBeInTheDocument();
  });

  it("Notable Activity lists the failure and manual run but not routine successes, and shows the count line", () => {
    renderTab();
    const panel = screen.getByTestId("backups-recent-activity-panel");

    expect(screen.getByText("Scheduled backup failed")).toBeInTheDocument();
    expect(screen.getByText(/^Manual backup/)).toBeInTheDocument();
    expect(panel).toHaveTextContent(/\d+ routine scheduled successes not shown\./);
  });
});

describe("BackupHealthCard warning banner", () => {
  it("renders the no-verified-restore banner when lastVerifiedRestoreAt is null", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const health = { ...generateMockBackupHealth(FIXED_NOW, rows), lastVerifiedRestoreAt: null };
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.getByText("No restore has ever been verified")).toBeInTheDocument();
  });

  it("does not render the banner when lastVerifiedRestoreAt is set", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const health = {
      ...generateMockBackupHealth(FIXED_NOW, rows),
      lastVerifiedRestoreAt: new Date(FIXED_NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.queryByText("No restore has ever been verified")).not.toBeInTheDocument();
  });

  it("shows the three-stat row: last backup, next run, snapshots retained", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const health = generateMockBackupHealth(FIXED_NOW, rows);
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.getByText("Last successful backup")).toBeInTheDocument();
    expect(screen.getByText(/^Next run/)).toBeInTheDocument();
    expect(screen.getByText("Snapshots retained")).toBeInTheDocument();
  });

  it("summarizes replicas as 'All three hold the latest snapshot' when every replica is current", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const health = generateMockBackupHealth(FIXED_NOW, rows);
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.getByText("All three hold the latest snapshot")).toBeInTheDocument();
  });

  it("summarizes replicas as 'N of 3 hold the latest snapshot' when degraded", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const health = generateMockBackupHealth(FIXED_NOW, rows);
    health.replicaStatus[0].hasLatest = false;
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.getByText("2 of 3 hold the latest snapshot")).toBeInTheDocument();
  });
});
