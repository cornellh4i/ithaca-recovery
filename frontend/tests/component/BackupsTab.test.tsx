import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import BackupsTab from "../../app/components/admin/backups/BackupsTab";
import BackupHealthCard from "../../app/components/admin/backups/BackupHealthCard";
import { ToastProvider } from "../../app/components/shared/ToastProvider";
import { generateMockActivityEvents, generateMockBackupHealth, generateMockBackupRows } from "../../app/components/admin/backups/mockBackups";
import type { ActivityEvent, BackupsUnconfiguredResponse } from "../../types/backups";

// BackupsTab anchors its own `now` once the three GET fetches resolve -- pin the system
// clock so every card ("Expires in", next-run, relative-age labels) renders deterministically
// under TZ=UTC, and so the fixtures below match what the component fetches.
const FIXED_NOW = new Date("2026-08-15T12:00:00Z");

const rows = generateMockBackupRows(FIXED_NOW);
const health = generateMockBackupHealth(FIXED_NOW, rows);
const activity = generateMockActivityEvents(FIXED_NOW);

const POLL_INTERVAL_MS = 10_000;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

interface FetchMockOptions {
  /** When set, every GET (list/health/activity) 503s with this body instead of succeeding. */
  unconfigured?: BackupsUnconfiguredResponse;
  /** When set, only GET /activity 503s with this body -- list/health still succeed. */
  activityUnconfigured?: BackupsUnconfiguredResponse;
  /** Extra activity events layered onto the fixture once the activity endpoint has been hit
   * `newRunAfterCall` times -- simulates a run appearing partway through a Back Up Now poll. */
  newRunAfterCall?: number;
  downloadUrl?: string | null;
  /** POST /api/admin/backups response mode -- defaults to "mock". */
  dispatchMode?: "mock" | "live";
}

/** Routes a `global.fetch` mock by URL/method the same way the real `/api/admin/backups*`
 * routes are shaped -- envelope-wrapped GETs, a dispatch POST, a per-id download GET. */
function setupFetchMock(options: FetchMockOptions = {}) {
  let activityCallCount = 0;
  const extraEvent: ActivityEvent = {
    id: "run-manual-new",
    trigger: "workflow_dispatch",
    actor: "admin@ithacarecovery.org",
    conclusion: "in_progress",
    startedAt: FIXED_NOW.toISOString(),
    durationSeconds: 0,
    reason: "Pre-deploy safety snapshot",
  };

  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (options.unconfigured) {
      return Promise.resolve(jsonResponse(options.unconfigured, 503));
    }

    if (url === "/api/admin/backups" && (!init || init.method === undefined)) {
      return Promise.resolve(jsonResponse({ mode: "mock", data: { rows, total: rows.length } }));
    }
    if (url === "/api/admin/backups" && init?.method === "POST") {
      return Promise.resolve(
        jsonResponse({ mode: options.dispatchMode ?? "mock", dispatched: true, triggeredBy: "admin@ithacarecovery.org" }),
      );
    }
    if (url === "/api/admin/backups/health") {
      return Promise.resolve(jsonResponse({ mode: "mock", data: health }));
    }
    if (url === "/api/admin/backups/activity") {
      if (options.activityUnconfigured) {
        return Promise.resolve(jsonResponse(options.activityUnconfigured, 503));
      }
      activityCallCount += 1;
      const events =
        options.newRunAfterCall && activityCallCount > options.newRunAfterCall
          ? [extraEvent, ...activity]
          : activity;
      return Promise.resolve(jsonResponse({ mode: "mock", data: { events } }));
    }
    if (url.match(/^\/api\/admin\/backups\/.+\/download$/)) {
      const url_ = options.downloadUrl === undefined ? null : options.downloadUrl;
      return Promise.resolve(jsonResponse({ mode: "mock", url: url_, expiresInSeconds: url_ ? 300 : null }));
    }
    return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Flushes the microtask chain a real (mocked) fetch->json->setState pipeline needs to
 * settle, without relying on timer-based polling (findBy*) that fights jest's fake timers. */
async function flushPromises() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const renderTab = async () => {
  const utils = render(
    <ToastProvider>
      <BackupsTab />
    </ToastProvider>,
  );
  await flushPromises();
  return utils;
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("BackupsTab", () => {
  it("renders all four cards once the fetches resolve", async () => {
    setupFetchMock();
    await renderTab();
    expect(screen.getByText("Backup Health")).toBeInTheDocument();
    expect(screen.getByText("Snapshots", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Restore Runbook")).toBeInTheDocument();
    expect(screen.getByText("Notable Activity")).toBeInTheDocument();
  });

  it("shows the mock-mode badge when the envelope reports mode 'mock'", async () => {
    setupFetchMock();
    await renderTab();
    expect(screen.getByText("Sample data — backup credentials not configured")).toBeInTheDocument();
  });

  it("shows the unconfigured panel on a 503 with a missing[] body", async () => {
    setupFetchMock({ unconfigured: { configured: false, missing: ["GCS_WORKING_CREDENTIALS", "R2_ACCESS_KEY_ID_READ"] } });
    await renderTab();
    expect(
      screen.getByText("Backup monitoring isn't configured in this environment"),
    ).toBeInTheDocument();
    expect(screen.getByText(/GCS_WORKING_CREDENTIALS, R2_ACCESS_KEY_ID_READ/)).toBeInTheDocument();
    expect(screen.getByText("docs/02-handoff/backup-infra-setup.md")).toBeInTheDocument();
    expect(screen.queryByText("Backup Health")).not.toBeInTheDocument();
  });

  it("degrades only the activity card, not the whole tab, when only /activity 503s", async () => {
    setupFetchMock({ activityUnconfigured: { configured: false, missing: ["GITHUB_BACKUPS_PAT"] } });
    await renderTab();

    expect(screen.getByText("Backup Health")).toBeInTheDocument();
    expect(screen.getByText("Snapshots", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText(/GitHub credentials not configured — run history unavailable/),
    ).toBeInTheDocument();
    expect(screen.getByText(/GITHUB_BACKUPS_PAT/)).toBeInTheDocument();
    expect(screen.queryByText("Backup monitoring isn't configured in this environment")).not.toBeInTheDocument();
  });

  it("shows the mock badge when only the activity envelope (not list) reports mode 'mock'", async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/admin/backups" && (!init || init.method === undefined)) {
        return Promise.resolve(jsonResponse({ mode: "live", data: { rows, total: rows.length } }));
      }
      if (url === "/api/admin/backups/health") {
        return Promise.resolve(jsonResponse({ mode: "live", data: health }));
      }
      if (url === "/api/admin/backups/activity") {
        return Promise.resolve(jsonResponse({ mode: "mock", data: { events: activity } }));
      }
      return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await renderTab();
    expect(screen.getByText("Sample data — backup credentials not configured")).toBeInTheDocument();
  });

  it("shows the unverified row with the Unverified treatment (index 3 of the fixture)", async () => {
    setupFetchMock();
    await renderTab();
    const unverifiedBadges = screen.getAllByLabelText("Unverified");
    expect(unverifiedBadges).toHaveLength(1);
  });

  it("shows a per-target present/missing tooltip for the single-replica and two-replica rows (indices 6 and 9)", async () => {
    const singleReplicaRow = rows.find((row) => row.replicas.length === 1);
    const twoReplicaRow = rows.find((row) => row.replicas.length === 2);
    expect(singleReplicaRow).toBeDefined();
    expect(twoReplicaRow).toBeDefined();

    setupFetchMock();
    await renderTab();
    expect(screen.getAllByText(/missing/).length).toBeGreaterThan(0);
  });

  it("gives every replica cell a hover tooltip, including fully-replicated rows", async () => {
    const fullReplicaRow = rows.find((row) => row.replicas.length === 3);
    expect(fullReplicaRow).toBeDefined();

    setupFetchMock();
    await renderTab();
    expect(screen.getAllByText(/present/).length).toBeGreaterThan(0);
  });

  it("shows 'Never' for the permanent row's expiry", async () => {
    const permanentRow = rows.find((row) => row.tier === "permanent");
    expect(permanentRow).toBeDefined();
    expect(permanentRow!.expiresAt).toBeNull();

    setupFetchMock();
    await renderTab();
    fireEvent.click(screen.getByRole("button", { name: /^Permanent \d+$/ }));
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("selecting a snapshot populates the Restore Runbook command with its artifact filename", async () => {
    setupFetchMock();
    await renderTab();
    expect(
      screen.getByText("Select a snapshot above to generate its restore command."),
    ).toBeInTheDocument();

    const firstRow = rows[0];
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);

    const commandBox = screen.getByText(new RegExp(`restore-db\\.sh.*${firstRow.id}\\.dump\\.age`));
    expect(commandBox).toBeInTheDocument();
    expect(screen.getByText(/^command for the selected snapshot/i)).toBeInTheDocument();
  });

  it("clicking a selected row again unselects it", async () => {
    setupFetchMock();
    await renderTab();
    const dataRows = screen.getAllByRole("row").slice(1);

    fireEvent.click(dataRows[0]);
    expect(
      screen.queryByText("Select a snapshot above to generate its restore command."),
    ).not.toBeInTheDocument();

    fireEvent.click(dataRows[0]);
    expect(
      screen.getByText("Select a snapshot above to generate its restore command."),
    ).toBeInTheDocument();
  });

  it("the runbook's copy button has an accessible 'Copy command' label", async () => {
    setupFetchMock();
    await renderTab();
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);

    expect(screen.getByRole("button", { name: "Copy command" })).toBeInTheDocument();
  });

  it("renders the drill command without a snapshot selection", async () => {
    setupFetchMock();
    await renderTab();

    // restore-drill.sh self-selects the newest monthly/ sidecar (no positional argument),
    // so unlike the restore command, the drill command box needs no Snapshots-row selection.
    expect(screen.getByText(/DRILL_KEY_USED=<A\|B>/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy drill command" })).toBeInTheDocument();
  });

  it("the drill command carries all three required placeholders and no artifact path", async () => {
    setupFetchMock();
    await renderTab();

    const drillBox = screen.getByText(
      /DRILL_KEY_USED=<A\|B>.*DRILL_TARGET_URL=<unpooled-scratch-url>.*AGE_IDENTITY_FILE=\/path\/to\/key.*restore-drill\.sh/,
    );
    expect(drillBox).toBeInTheDocument();
    expect(drillBox.textContent).not.toMatch(/\.dump\.age/);
  });

  it("the Snapshots filter chips filter the table (Unverified, then Monthly)", async () => {
    const unverifiedCount = rows.filter((r) => !r.verified).length;
    const monthlyCount = rows.filter((r) => r.tier === "monthly").length;

    setupFetchMock();
    await renderTab();

    fireEvent.click(screen.getByRole("button", { name: `Unverified ${unverifiedCount}` }));
    expect(screen.getAllByLabelText("Unverified")).toHaveLength(unverifiedCount);

    fireEvent.click(screen.getByRole("button", { name: `Monthly ${monthlyCount}` }));
    expect(screen.getAllByText("Monthly", { selector: "span" }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Unverified")).not.toBeInTheDocument();
  });

  it("changing the filter resets pagination back to page 1", async () => {
    setupFetchMock();
    await renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(screen.getByText(/^11-20 of/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Monthly \d+$/ }));
    expect(screen.getByText(/^1-10 of 13$/)).toBeInTheDocument();
  });

  it("clears the snapshot selection when the active filter no longer matches it", async () => {
    setupFetchMock();
    await renderTab();

    fireEvent.click(screen.getByRole("button", { name: /^Daily \d+$/ }));
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);
    expect(
      screen.queryByText("Select a snapshot above to generate its restore command."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Monthly \d+$/ }));
    expect(
      screen.getByText("Select a snapshot above to generate its restore command."),
    ).toBeInTheDocument();
  });

  it("dispatches POST on Back Up Now and clears the lock once a new run appears in a later poll (live mode)", async () => {
    const fetchMock = setupFetchMock({ newRunAfterCall: 2, dispatchMode: "live" });
    await renderTab();
    const button = screen.getByRole("button", { name: "Back Up Now" });
    expect(button).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByText("Backup dispatched — runs appear in Recent Activity"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/backups",
      expect.objectContaining({ method: "POST" }),
    );

    // First poll tick (10s): activity endpoint's 2nd call (post-mount baseline was call #1) is
    // still the unchanged fixture, so the lock stays held.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(button).toBeDisabled();

    // Second poll tick: the mock now injects a new run (call #3 > newRunAfterCall), so the
    // poll should detect it, refresh, and clear the lock.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(button).not.toBeDisabled();
  });

  it("short-circuits the lock in mock mode instead of spinning the full poll window (activity fixtures never grow)", async () => {
    setupFetchMock({ dispatchMode: "mock" });
    await renderTab();
    const button = screen.getByRole("button", { name: "Back Up Now" });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button).toBeDisabled();

    // A single poll interval's worth of time is nowhere near the 90s poll window, but mock
    // mode's short settle delay has already cleared the lock without hitting /activity again.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(button).not.toBeDisabled();
  });

  it("clears the lock and shows an error toast when the dispatch POST fails", async () => {
    setupFetchMock();
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (url === "/api/admin/backups" && init?.method === "POST") {
        return Promise.resolve(jsonResponse({}, 500));
      }
      if (url === "/api/admin/backups" && !init) {
        return Promise.resolve(jsonResponse({ mode: "mock", data: { rows, total: rows.length } }));
      }
      if (url === "/api/admin/backups/health") {
        return Promise.resolve(jsonResponse({ mode: "mock", data: health }));
      }
      if (url === "/api/admin/backups/activity") {
        return Promise.resolve(jsonResponse({ mode: "mock", data: { events: activity } }));
      }
      return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    }) as unknown as typeof fetch;

    await renderTab();
    const button = screen.getByRole("button", { name: "Back Up Now" });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(button).not.toBeDisabled();
    expect(screen.getByText("Failed to dispatch backup")).toBeInTheDocument();
  });

  it("download opens the returned signed URL in a new tab", async () => {
    setupFetchMock({ downloadUrl: "https://storage.example.com/signed/backup-1.dump.age" });
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    await renderTab();

    const downloadButtons = screen.getAllByLabelText(/Download \(encrypted\)/);
    await act(async () => {
      fireEvent.click(downloadButtons[0]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openSpy).toHaveBeenCalledWith(
      "https://storage.example.com/signed/backup-1.dump.age",
      "_blank",
      "noopener",
    );
  });

  it("shows an informational toast instead of opening a tab when the download URL is null (mock mode)", async () => {
    setupFetchMock();
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
    await renderTab();

    const downloadButtons = screen.getAllByLabelText(/Download \(encrypted\)/);
    await act(async () => {
      fireEvent.click(downloadButtons[0]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Sample backup — no file to download in mock mode")).toBeInTheDocument();
  });

  it("clicking the Verified header info button shows the legend, and clicking outside closes it", async () => {
    setupFetchMock();
    await renderTab();

    expect(screen.queryByText(/restored into a scratch database/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "What does Verified mean?" }));
    expect(screen.getByText(/restored into a scratch database/)).toBeInTheDocument();
    expect(screen.getByText(/no verification record exists/)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText(/restored into a scratch database/)).not.toBeInTheDocument();
  });

  it("Notable Activity lists the failure and manual run but not routine successes, and shows the count line", async () => {
    setupFetchMock();
    await renderTab();
    const panel = screen.getByTestId("backups-recent-activity-panel");

    expect(screen.getByText("Scheduled backup failed")).toBeInTheDocument();
    expect(screen.getByText(/^Manual backup/)).toBeInTheDocument();
    expect(panel).toHaveTextContent(/\d+ routine scheduled successes not shown\./);
  });

  it("shows four per-card loading shells with progress bars while fetching", () => {
    // Never-resolving fetch keeps the tab in its loading phase.
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(
      <ToastProvider>
        <BackupsTab />
      </ToastProvider>,
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
    expect(screen.getByText("Loading snapshots…")).toBeInTheDocument();
  });

  it("attributes manual runs to the Backups tab, not the PAT owner's GitHub login", async () => {
    setupFetchMock();
    await renderTab();
    const panel = screen.getByTestId("backups-recent-activity-panel");

    // GitHub attributes every PAT dispatch to the PAT owner regardless of which admin clicked,
    // so the login would misname the actor on every manual run.
    expect(panel).toHaveTextContent("via Backups tab");
  });
});

describe("BackupHealthCard warning banner", () => {
  it("renders the no-verified-restore banner when lastVerifiedRestoreAt is null", () => {
    const bannerHealth = {
      ...generateMockBackupHealth(FIXED_NOW, rows),
      lastVerifiedRestoreAt: null,
      lastVerifiedRestoreKey: null,
    };
    render(<BackupHealthCard health={bannerHealth} now={FIXED_NOW} />);
    expect(screen.getByText("No restore has ever been verified")).toBeInTheDocument();
  });

  it("does not render the banner when lastVerifiedRestoreAt is set", () => {
    const bannerHealth = {
      ...generateMockBackupHealth(FIXED_NOW, rows),
      lastVerifiedRestoreAt: new Date(FIXED_NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
    render(<BackupHealthCard health={bannerHealth} now={FIXED_NOW} />);
    expect(screen.queryByText("No restore has ever been verified")).not.toBeInTheDocument();
  });

  it("shows the four-stat row: last backup, next run, snapshots retained, last verified restore", () => {
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.getByText("Last successful backup")).toBeInTheDocument();
    expect(screen.getByText(/^Next run/)).toBeInTheDocument();
    expect(screen.getByText("Snapshots retained")).toBeInTheDocument();
    expect(screen.getAllByText(/^Last verified restore/).length).toBeGreaterThan(0);
  });

  it("summarizes replicas as 'All three hold the latest snapshot' when every replica is current", () => {
    render(<BackupHealthCard health={health} now={FIXED_NOW} />);
    expect(screen.getByText("All three hold the latest snapshot")).toBeInTheDocument();
  });

  it("summarizes replicas as 'N of 3 hold the latest snapshot' when degraded", () => {
    const degradedHealth = generateMockBackupHealth(FIXED_NOW, rows);
    degradedHealth.replicaStatus[0].hasLatest = false;
    render(<BackupHealthCard health={degradedHealth} now={FIXED_NOW} />);
    expect(screen.getByText("2 of 3 hold the latest snapshot")).toBeInTheDocument();
  });

  it("fresh (< 100 days): shows no banner, and the stat shows date + key letter", () => {
    const freshHealth = {
      ...generateMockBackupHealth(FIXED_NOW, rows),
      lastVerifiedRestoreAt: new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastVerifiedRestoreKey: "A" as const,
    };
    render(<BackupHealthCard health={freshHealth} now={FIXED_NOW} />);
    expect(screen.queryByText("No restore has ever been verified")).not.toBeInTheDocument();
    expect(screen.queryByText(/run the quarterly drill/)).not.toBeInTheDocument();
    expect(screen.getByText(/Last verified restore/)).toBeInTheDocument();
    expect(screen.getByText(/key A/)).toBeInTheDocument();
  });

  it("stale (>= 100 days): shows the stale-warning banner with a months-ago count", () => {
    const staleHealth = {
      ...generateMockBackupHealth(FIXED_NOW, rows),
      lastVerifiedRestoreAt: new Date(FIXED_NOW.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      lastVerifiedRestoreKey: "B" as const,
    };
    render(<BackupHealthCard health={staleHealth} now={FIXED_NOW} />);
    expect(screen.queryByText("No restore has ever been verified")).not.toBeInTheDocument();
    expect(screen.getByText(/Last verified restore was .* months? ago — run the quarterly drill/)).toBeInTheDocument();
  });

  it("never verified: shows the never-verified banner, not the stale-warning banner", () => {
    const neverHealth = { ...generateMockBackupHealth(FIXED_NOW, rows), lastVerifiedRestoreAt: null, lastVerifiedRestoreKey: null };
    render(<BackupHealthCard health={neverHealth} now={FIXED_NOW} />);
    expect(screen.getByText("No restore has ever been verified")).toBeInTheDocument();
    expect(screen.queryByText(/run the quarterly drill/)).not.toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });
});
