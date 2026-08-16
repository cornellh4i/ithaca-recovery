import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import BackupsTab from "../../app/components/admin/backups/BackupsTab";
import BackupHealthCard from "../../app/components/admin/backups/BackupHealthCard";
import { ToastProvider } from "../../app/components/shared/ToastProvider";
import {
  freshnessFor,
  generateMockBackupHealth,
  generateMockBackupRows,
} from "../../app/components/admin/backups/mockBackups";
import type { BackupHealth, BackupListRow } from "../../types/backups";

// BackupsTab seeds its own `now` via `useState(() => new Date())` -- pin the system clock so
// every card (freshness pill, "Expires in", next-run) renders deterministically under TZ=UTC.
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
    expect(screen.getByText(/^Snapshots \(\d+\)$/)).toBeInTheDocument();
    expect(screen.getByText("Restore Runbook")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
  });

  it("shows the unverified row with the verifiedNo treatment (index 3 of the fixture)", () => {
    renderTab();
    const unverifiedBadges = screen.getAllByText("Unverified");
    expect(unverifiedBadges.length).toBeGreaterThan(0);
    // The fixture guarantees exactly one unverified row among the dailies.
    expect(unverifiedBadges).toHaveLength(1);
  });

  it("renders a missing replica dot for the single-replica row (index 6 of the fixture)", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const singleReplicaRow = rows.find((row) => row.replicas.length === 1);
    expect(singleReplicaRow).toBeDefined();

    renderTab();
    // The single-replica row contributes 2 "Missing from" dots, the two-replica row
    // contributes 1 -- both are on the first (default) page alongside the fixture's other rows.
    const missingDots = screen.getAllByTitle(/^Missing from /);
    expect(missingDots).toHaveLength(3);
  });

  it("fixture contains both a single-replica and a two-replica (one-missing) row", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const replicaCounts = rows.map((row) => row.replicas.length);
    expect(replicaCounts).toContain(1);
    expect(replicaCounts).toContain(2);
  });

  it("shows 'never' for the permanent row's expiry", () => {
    const rows = generateMockBackupRows(FIXED_NOW);
    const permanentRow = rows.find((row) => row.tier === "permanent");
    expect(permanentRow).toBeDefined();
    expect(permanentRow!.expiresAt).toBeNull();

    renderTab();
    // The permanent row is the oldest of 28 fixture rows (10/page) -- page to the last page
    // where it lives before asserting its "never" expiry.
    fireEvent.click(screen.getByLabelText(`Page ${Math.ceil(rows.length / 10)}`));
    expect(screen.getByText("never")).toBeInTheDocument();
  });

  it("selecting a snapshot populates the Restore Runbook command with its artifact filename", () => {
    renderTab();
    expect(
      screen.getByText("Select a snapshot above to generate its restore command.")
    ).toBeInTheDocument();

    const rows = generateMockBackupRows(FIXED_NOW);
    const firstRow = rows[0];
    const checkboxes = screen.getAllByLabelText(/Select snapshot from /i);
    fireEvent.click(checkboxes[0]);

    const commandBox = screen.getByText(new RegExp(`${firstRow.id}\\.dump\\.age`));
    expect(commandBox).toBeInTheDocument();
  });

  it("clicking a selected row's checkbox again unselects it", () => {
    renderTab();
    const checkboxes = screen.getAllByLabelText(/Select snapshot from /i);

    fireEvent.click(checkboxes[0]);
    expect(
      screen.queryByText("Select a snapshot above to generate its restore command.")
    ).not.toBeInTheDocument();

    fireEvent.click(checkboxes[0]);
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

  it("Download button is labeled 'Download (encrypted)' and fires the stub toast", () => {
    renderTab();
    const downloadButtons = screen.getAllByText("Download (encrypted)");
    expect(downloadButtons.length).toBeGreaterThan(0);

    fireEvent.click(downloadButtons[0]);

    expect(
      screen.getByText("Signed-URL download arrives with the API wiring PR")
    ).toBeInTheDocument();
  });
});

describe("BackupHealthCard freshness pill", () => {
  const buildHealth = (ageHours: number): BackupHealth => {
    const lastSuccessfulBackupAt = new Date(
      FIXED_NOW.getTime() - ageHours * 60 * 60 * 1000
    ).toISOString();
    return {
      ...generateMockBackupHealth(FIXED_NOW, [] as BackupListRow[]),
      lastSuccessfulBackupAt,
      freshness: freshnessFor(lastSuccessfulBackupAt, FIXED_NOW),
    };
  };

  it("renders 'Healthy' just under the 26h warn boundary", () => {
    render(<BackupHealthCard health={buildHealth(25.9)} now={FIXED_NOW} />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("renders 'Aging' at exactly the 26h warn boundary", () => {
    render(<BackupHealthCard health={buildHealth(26)} now={FIXED_NOW} />);
    expect(screen.getByText("Aging")).toBeInTheDocument();
  });

  it("renders 'Aging' just under the 72h error boundary", () => {
    render(<BackupHealthCard health={buildHealth(71.9)} now={FIXED_NOW} />);
    expect(screen.getByText("Aging")).toBeInTheDocument();
  });

  it("renders 'Stale' at exactly the 72h error boundary", () => {
    render(<BackupHealthCard health={buildHealth(72)} now={FIXED_NOW} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });
});
