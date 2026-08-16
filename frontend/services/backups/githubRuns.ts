// Recent Activity + manual dispatch, backed by the GitHub Actions REST API against the same
// backup-db.yml workflow the scheduled/manual runs actually execute.
import type { ActivityConclusion, ActivityEvent, ActivityTrigger } from "../../types/backups";
import { getGithubConfig } from "./config";

const WORKFLOW_FILE = "backup-db.yml";
const GITHUB_API_BASE = "https://api.github.com";

interface GithubRun {
  id: number;
  event: string;
  status: string;
  conclusion: string | null;
  actor: { login: string } | null;
  run_started_at: string;
  updated_at: string;
}

function authHeaders(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function mapConclusion(run: GithubRun): ActivityConclusion {
  if (run.status !== "completed") return "in_progress";
  return run.conclusion === "success" ? "success" : "failure";
}

function mapTrigger(event: string): ActivityTrigger {
  return event === "workflow_dispatch" ? "workflow_dispatch" : "schedule";
}

export async function fetchRecentActivity(): Promise<ActivityEvent[]> {
  const { pat, repo } = getGithubConfig();
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=20`, {
    headers: authHeaders(pat),
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions runs request failed with status ${response.status}`);
  }
  const body = (await response.json()) as { workflow_runs: GithubRun[] };
  return body.workflow_runs.map((run) => ({
    id: String(run.id),
    trigger: mapTrigger(run.event),
    actor: run.actor?.login ?? "unknown",
    conclusion: mapConclusion(run),
    startedAt: run.run_started_at,
    durationSeconds: Math.max(0, Math.round((new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000)),
    // The runs API doesn't expose workflow_dispatch inputs (the `reason` the operator typed) --
    // only the dispatch response at trigger time ever sees it, so history can't recover it.
    reason: null,
  }));
}

/** POSTs a workflow_dispatch event; a 204 response means GitHub accepted the dispatch. */
export async function dispatchBackup(reason: string): Promise<void> {
  const { pat, repo } = getGithubConfig();
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: { ...authHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "master", inputs: { reason } }),
  });
  if (response.status !== 204) {
    throw new Error(`GitHub Actions dispatch request failed with status ${response.status}`);
  }
}
