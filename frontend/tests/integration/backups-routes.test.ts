// Route-handler tests for the real Backups admin tab backend (services/backups/*). Storage and
// GitHub calls are mocked -- these tests cover auth gating, mode resolution (live/mock/503), and
// response-shape/error-hiding, not the actual GCS/R2/GitHub wiring itself.
import type { BackupListRow } from "../../types/backups";

jest.mock("../../services/backups/storage", () => ({
  listBackups: jest.fn(),
  signedDownloadUrl: jest.fn(),
}));

jest.mock("../../services/backups/githubRuns", () => ({
  fetchRecentActivity: jest.fn(),
  dispatchBackup: jest.fn(),
}));

import { requireRole } from "../../services/auth";
import { listBackups, signedDownloadUrl } from "../../services/backups/storage";
import { dispatchBackup, fetchRecentActivity } from "../../services/backups/githubRuns";

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

const mockedRequireRole = requireRole as jest.Mock;
const mockedListBackups = listBackups as jest.Mock;
const mockedSignedDownloadUrl = signedDownloadUrl as jest.Mock;
const mockedFetchRecentActivity = fetchRecentActivity as jest.Mock;
const mockedDispatchBackup = dispatchBackup as jest.Mock;

const STORAGE_VARS = [
  "GCS_BACKUPS_CREDENTIALS",
  "GCS_WORKING_BUCKET",
  "GCS_ARCHIVE_BUCKET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID_READ",
  "R2_SECRET_ACCESS_KEY_READ",
  "R2_BUCKET",
];
const GITHUB_VARS = ["GITHUB_BACKUPS_PAT"];
const ALL_BACKUPS_VARS = [...STORAGE_VARS, ...GITHUB_VARS];

const originalEnv = { ...process.env };

function clearBackupsEnv() {
  ALL_BACKUPS_VARS.forEach((name) => delete process.env[name]);
}

const VALID_GCS_CREDENTIALS = Buffer.from(
  JSON.stringify({ client_email: "backup@icr.iam.gserviceaccount.com", private_key: "test-key", project_id: "icr-db-backups-prod" }),
).toString("base64");

function setLiveEnv() {
  STORAGE_VARS.forEach((name) => {
    process.env[name] = name === "GCS_BACKUPS_CREDENTIALS" ? VALID_GCS_CREDENTIALS : "test-value";
  });
  GITHUB_VARS.forEach((name) => {
    process.env[name] = "test-value";
  });
}

const superAdminSession = { user: { role: "SUPER_ADMIN", email: "root@icr.org" } };
const adminSession = { user: { role: "ADMIN", email: "regular@icr.org" } };
const forbiddenResponse = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

const sampleRow: BackupListRow = {
  id: "backup-20260815T011700Z",
  createdAt: "2026-08-15T01:17:00.000Z",
  tier: "daily",
  source: "automatic",
  triggeredBy: null,
  reason: null,
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  pgVersion: "18.0",
  appVersion: "2026.8.1",
  gitSha: "abc1234",
  ageRecipients: ["age1aaa", "age1bbb"],
  rowCounts: { Meeting: 10 },
  verified: true,
  verificationMode: "structural",
  verifiedAt: "2026-08-15T01:32:00.000Z",
  replicas: ["gcs-working", "gcs-archive", "r2"],
  expiresAt: "2026-09-05T01:17:00.000Z",
};

afterEach(() => {
  // Restore first: jest.replaceProperty(process, "env", ...) reverts to the object captured at
  // replacement time, so restoring after the reset would resurrect a mid-test env snapshot.
  jest.restoreAllMocks();
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

describe("GET /api/admin/backups", () => {
  test("plain ADMIN is rejected with 403, not served any data", async () => {
    mockedRequireRole.mockResolvedValue(forbiddenResponse);
    const { GET } = await import("../../app/api/admin/backups/route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mockedListBackups).not.toHaveBeenCalled();
  });

  test("serves a mock-mode envelope when backup env vars are absent outside production", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    const { GET } = await import("../../app/api/admin/backups/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("mock");
    expect(Array.isArray(body.data.rows)).toBe(true);
    expect(mockedListBackups).not.toHaveBeenCalled();
  });

  test("maps a live listing when env vars are present", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedListBackups.mockResolvedValue({ rows: [sampleRow], workingObjectCount: 1, archiveObjectCount: 1, r2ObjectCount: 1 });
    const { GET } = await import("../../app/api/admin/backups/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "live", data: { rows: [sampleRow], total: 1 } });
  });

  test("returns 503 with missing[] when env vars are absent in production", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production" });
    const { GET } = await import("../../app/api/admin/backups/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.configured).toBe(false);
    expect(body.missing).toEqual(expect.arrayContaining(["GCS_BACKUPS_CREDENTIALS", "R2_BUCKET"]));
  });

  test("treats an undecodable GCS_BACKUPS_CREDENTIALS value as missing rather than 500ing", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    process.env.GCS_BACKUPS_CREDENTIALS = "not-valid-base64-json";
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production" });
    const { GET } = await import("../../app/api/admin/backups/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.missing).toContain("GCS_BACKUPS_CREDENTIALS");
  });

  test("never leaks a raw upstream error into the response body", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedListBackups.mockRejectedValue(new Error("permission denied on bucket icr-db-backups-prod: service account lacks storage.objects.list"));
    const { GET } = await import("../../app/api/admin/backups/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal Server Error" });
    expect(JSON.stringify(body)).not.toMatch(/service account/);
  });
});

describe("POST /api/admin/backups", () => {
  test("rejects a reason longer than 200 characters with 400", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    const { POST } = await import("../../app/api/admin/backups/route");
    const request = new Request("http://localhost/api/admin/backups", {
      method: "POST",
      body: JSON.stringify({ reason: "x".repeat(201) }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockedDispatchBackup).not.toHaveBeenCalled();
  });

  test("mock mode dispatches nothing but still returns a dispatched response", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    const { POST } = await import("../../app/api/admin/backups/route");
    const request = new Request("http://localhost/api/admin/backups", { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "mock", dispatched: true, triggeredBy: "root@icr.org" });
    expect(mockedDispatchBackup).not.toHaveBeenCalled();
  });

  test("live mode dispatches with a default reason that omits the caller's email", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedDispatchBackup.mockResolvedValue(undefined);
    const { POST } = await import("../../app/api/admin/backups/route");
    const request = new Request("http://localhost/api/admin/backups", { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "live", dispatched: true, triggeredBy: "root@icr.org" });
    // The sidecar/failure-issue body this reason lands in is unencrypted -- the email only
    // belongs in the server-side console audit line, never the dispatched reason itself.
    expect(mockedDispatchBackup).toHaveBeenCalledWith("Manual run from Admin → Backups");
    expect(JSON.stringify(mockedDispatchBackup.mock.calls[0])).not.toMatch(/root@icr\.org/);
  });

  test("treats a whitespace-only reason as absent and falls back to the default", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedDispatchBackup.mockResolvedValue(undefined);
    const { POST } = await import("../../app/api/admin/backups/route");
    const request = new Request("http://localhost/api/admin/backups", { method: "POST", body: JSON.stringify({ reason: "   " }) });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mockedDispatchBackup).toHaveBeenCalledWith("Manual run from Admin → Backups");
  });

  test("malformed JSON is a 400, not a dispatch with the default reason", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    const { POST } = await import("../../app/api/admin/backups/route");
    const request = new Request("http://localhost/api/admin/backups", { method: "POST", body: "{not json" });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockedDispatchBackup).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/backups/health", () => {
  test("plain ADMIN is rejected with 403", async () => {
    mockedRequireRole.mockResolvedValue(forbiddenResponse);
    const { GET } = await import("../../app/api/admin/backups/health/route");
    const response = await GET();
    expect(response.status).toBe(403);
  });

  test("mock mode returns a BackupsEnvelope-shaped health payload", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    const { GET } = await import("../../app/api/admin/backups/health/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("mock");
    expect(body.data).toHaveProperty("freshness");
    expect(body.data).toHaveProperty("replicaStatus");
  });

  test("503s with missing[] in production when unconfigured", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: "production" });
    const { GET } = await import("../../app/api/admin/backups/health/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.configured).toBe(false);
    expect(body.missing.length).toBeGreaterThan(0);
  });
});

describe("GET /api/admin/backups/activity", () => {
  test("mock mode returns fixture events", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    const { GET } = await import("../../app/api/admin/backups/activity/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("mock");
    expect(Array.isArray(body.data.events)).toBe(true);
    expect(mockedFetchRecentActivity).not.toHaveBeenCalled();
  });

  test("live mode maps GitHub run history", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedFetchRecentActivity.mockResolvedValue([
      { id: "1", trigger: "schedule", actor: "github-actions[bot]", conclusion: "success", startedAt: "2026-08-15T01:17:00.000Z", durationSeconds: 120, reason: null },
    ]);
    const { GET } = await import("../../app/api/admin/backups/activity/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("live");
    expect(body.data.events).toHaveLength(1);
  });
});

describe("GET /api/admin/backups/[id]/download", () => {
  test("plain ADMIN is rejected with 403", async () => {
    mockedRequireRole.mockResolvedValue(forbiddenResponse);
    const { GET } = await import("../../app/api/admin/backups/[id]/download/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("http://localhost/api/admin/backups/backup-20260815T011700Z/download"));
    expect(response.status).toBe(403);
  });

  test("unknown id returns 404 in live mode", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedListBackups.mockResolvedValue({ rows: [sampleRow], workingObjectCount: 1, archiveObjectCount: 1, r2ObjectCount: 1 });
    const { GET } = await import("../../app/api/admin/backups/[id]/download/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("http://localhost/api/admin/backups/does-not-exist/download"));
    expect(response.status).toBe(404);
    expect(mockedSignedDownloadUrl).not.toHaveBeenCalled();
  });

  test("409s when the row's replicas don't include gcs-working (lifecycle-deleted or failed upload)", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedListBackups.mockResolvedValue({
      rows: [{ ...sampleRow, replicas: ["gcs-archive", "r2"] }],
      workingObjectCount: 0,
      archiveObjectCount: 1,
      r2ObjectCount: 1,
    });
    const { GET } = await import("../../app/api/admin/backups/[id]/download/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest(`http://localhost/api/admin/backups/${sampleRow.id}/download`));
    expect(response.status).toBe(409);
    expect(mockedSignedDownloadUrl).not.toHaveBeenCalled();
  });

  test("known id returns a signed URL in live mode", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedListBackups.mockResolvedValue({ rows: [sampleRow], workingObjectCount: 1, archiveObjectCount: 1, r2ObjectCount: 1 });
    mockedSignedDownloadUrl.mockResolvedValue("https://storage.googleapis.com/signed-url-example");
    const { GET } = await import("../../app/api/admin/backups/[id]/download/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest(`http://localhost/api/admin/backups/${sampleRow.id}/download`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "live", url: "https://storage.googleapis.com/signed-url-example", expiresInSeconds: 300 });
  });

  test("mock mode returns a null url for a known fixture id", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    const { generateMockBackupRows } = await import("../../app/components/admin/backups/mockBackups");
    const knownId = generateMockBackupRows(new Date())[0].id;
    const { GET } = await import("../../app/api/admin/backups/[id]/download/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest(`http://localhost/api/admin/backups/${knownId}/download`));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "mock", url: null, expiresInSeconds: null });
  });

  test("mock mode skips id-vs-listing validation entirely -- an id from a stale cron slot still 200s", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    clearBackupsEnv();
    const { GET } = await import("../../app/api/admin/backups/[id]/download/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(new NextRequest("http://localhost/api/admin/backups/backup-not-in-any-listing/download"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "mock", url: null, expiresInSeconds: null });
  });
});
