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
  "GCS_BACKUPS_WORKING_BUCKET",
  "GCS_BACKUPS_ARCHIVE_BUCKET",
  "R2_BACKUPS_ACCOUNT_ID",
  "R2_BACKUPS_ACCESS_KEY_ID",
  "R2_BACKUPS_SECRET_ACCESS_KEY",
  "R2_BACKUPS_BUCKET",
];
const GITHUB_VARS = ["GITHUB_BACKUPS_PAT"];
const ALL_BACKUPS_VARS = [...STORAGE_VARS, ...GITHUB_VARS];

const originalEnv = { ...process.env };

function clearBackupsEnv() {
  ALL_BACKUPS_VARS.forEach((name) => delete process.env[name]);
}

function setLiveEnv() {
  STORAGE_VARS.forEach((name) => {
    process.env[name] = name === "GCS_BACKUPS_CREDENTIALS" ? Buffer.from("{}").toString("base64") : "test-value";
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
  process.env = { ...originalEnv };
  jest.clearAllMocks();
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
    expect(body.missing).toEqual(expect.arrayContaining(["GCS_BACKUPS_CREDENTIALS", "R2_BACKUPS_BUCKET"]));
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

  test("live mode dispatches with the default reason including the caller's email", async () => {
    mockedRequireRole.mockResolvedValue(superAdminSession);
    setLiveEnv();
    mockedDispatchBackup.mockResolvedValue(undefined);
    const { POST } = await import("../../app/api/admin/backups/route");
    const request = new Request("http://localhost/api/admin/backups", { method: "POST", body: JSON.stringify({}) });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ mode: "live", dispatched: true, triggeredBy: "root@icr.org" });
    expect(mockedDispatchBackup).toHaveBeenCalledWith(expect.stringContaining("root@icr.org"));
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
});
