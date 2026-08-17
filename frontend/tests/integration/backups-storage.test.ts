// Exercises services/backups/storage.ts against real-shaped GCS/R2 SDK responses (mocked at the
// SDK level, not at storage.ts itself) -- these are the id/key-shape bugs backups-routes.test.ts
// can't catch because it mocks storage.ts's exports wholesale.
import type { BackupMeta } from "../../types/backups";

let filesByBucketPrefix: Record<string, Record<string, string[]>> = {};
let metaByKey: Record<string, BackupMeta> = {};
// Working-bucket drill-verified.json content -- raw string so malformed-JSON cases can be
// exercised, `undefined` means "not found" (404), matching a real never-drilled bucket.
let markerContent: string | undefined;

const WORKING_BUCKET = "icr-db-backups-prod";
const ARCHIVE_BUCKET = "icr-db-backups-archive";
const DRILL_MARKER_KEY = "drill-verified.json";

const mockGetSignedUrl = jest.fn().mockResolvedValue(["https://storage.googleapis.com/signed-url-example"]);
const mockFile = jest.fn((key: string) => ({
  download: () => {
    if (key === DRILL_MARKER_KEY) {
      if (markerContent === undefined) {
        const notFound = Object.assign(new Error("not found"), { code: 404 });
        return Promise.reject(notFound);
      }
      return Promise.resolve([Buffer.from(markerContent)]);
    }
    return Promise.resolve([Buffer.from(JSON.stringify(metaByKey[key]))]);
  },
  getSignedUrl: mockGetSignedUrl,
}));
const mockBucket = jest.fn((bucketName: string) => ({
  getFiles: ({ prefix }: { prefix: string }) => {
    const names = filesByBucketPrefix[bucketName]?.[prefix] ?? [];
    return Promise.resolve([names.map((name) => ({ name }))]);
  },
  file: mockFile,
}));

jest.mock("@google-cloud/storage", () => ({
  Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
}));

const mockSend = jest.fn().mockResolvedValue({ Contents: [] });
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ input })),
}));

// No real STS/IAM calls in this suite -- fromJSON just needs to return something truthy that
// Storage's mock constructor above never inspects.
jest.mock("google-auth-library", () => ({
  ExternalAccountClient: { fromJSON: jest.fn().mockReturnValue({}) },
}));
jest.mock("@vercel/functions/oidc", () => ({
  getVercelOidcToken: jest.fn().mockResolvedValue("test-oidc-token"),
}));

const STORAGE_VARS = {
  GCP_BACKUPS_WIF_PROVIDER: "projects/123/locations/global/workloadIdentityPools/pool/providers/provider",
  GCP_BACKUPS_SERVICE_ACCOUNT: "backups-tab-reader@icr-management-system.iam.gserviceaccount.com",
  GCS_WORKING_BUCKET: WORKING_BUCKET,
  GCS_ARCHIVE_BUCKET: ARCHIVE_BUCKET,
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID_READ: "key",
  R2_SECRET_ACCESS_KEY_READ: "secret",
  R2_BUCKET: "icr-db-backup-r2",
};

const originalEnv = { ...process.env };

function makeMeta(overrides: Partial<BackupMeta> = {}): BackupMeta {
  return {
    id: "20260815T011700Z",
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
    ...overrides,
  };
}

beforeEach(() => {
  process.env = { ...originalEnv, ...STORAGE_VARS };
  jest.clearAllMocks();
  mockGetSignedUrl.mockResolvedValue(["https://storage.googleapis.com/signed-url-example"]);
  mockSend.mockResolvedValue({ Contents: [] });
  filesByBucketPrefix = {};
  metaByKey = {};
  markerContent = undefined;
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe("listBackups against real-shaped keys", () => {
  test("a real bare-timestamp sidecar id resolves non-empty replicas via the backup-<id> key convention", async () => {
    const dumpKey = "daily/backup-20260815T011700Z.dump.age";
    const metaKey = "daily/backup-20260815T011700Z.meta.json";
    // Real upload-backup.sh key shape: `<tier>/backup-<id>.dump.age`, not `<tier>/<id>.dump.age`.
    filesByBucketPrefix = {
      [WORKING_BUCKET]: { "daily/": [dumpKey, metaKey], "monthly/": [], "permanent/": [] },
      [ARCHIVE_BUCKET]: { "daily/": [dumpKey], "monthly/": [], "permanent/": [] },
    };
    metaByKey[metaKey] = makeMeta();
    mockSend.mockResolvedValue({ Contents: [{ Key: dumpKey }] });

    const { listBackups, signedDownloadUrl } = await import("../../services/backups/storage");
    const { rows } = await listBackups();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("20260815T011700Z");
    expect(rows[0].replicas).toEqual(expect.arrayContaining(["gcs-working", "gcs-archive", "r2"]));

    await signedDownloadUrl(rows[0].id, rows[0].tier);
    expect(mockFile).toHaveBeenCalledWith(dumpKey);
  });

  test("builds the external-account config with the exact WIF/STS/impersonation shapes", async () => {
    filesByBucketPrefix = {
      [WORKING_BUCKET]: { "daily/": [], "monthly/": [], "permanent/": [] },
      [ARCHIVE_BUCKET]: { "daily/": [], "monthly/": [], "permanent/": [] },
    };
    mockSend.mockResolvedValue({ Contents: [] });

    const { ExternalAccountClient } = jest.requireMock("google-auth-library") as {
      ExternalAccountClient: { fromJSON: jest.Mock };
    };
    const { getVercelOidcToken } = jest.requireMock("@vercel/functions/oidc") as {
      getVercelOidcToken: jest.Mock;
    };
    const { listBackups } = await import("../../services/backups/storage");
    await listBackups();

    // These four strings only ever fail in production -- pin them here.
    expect(ExternalAccountClient.fromJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "external_account",
        audience: `//iam.googleapis.com/${STORAGE_VARS.GCP_BACKUPS_WIF_PROVIDER}`,
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        token_url: "https://sts.googleapis.com/v1/token",
        service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${STORAGE_VARS.GCP_BACKUPS_SERVICE_ACCOUNT}:generateAccessToken`,
      }),
    );

    // The supplier must delegate per call (a token captured at construction would go stale).
    const supplier = ExternalAccountClient.fromJSON.mock.calls[0][0].subject_token_supplier;
    await expect(supplier.getSubjectToken()).resolves.toBe("test-oidc-token");
    expect(getVercelOidcToken).toHaveBeenCalled();
  });

  test("dedupes a 1st-of-month artifact uploaded to both daily/ and monthly/, keeping the monthly row", async () => {
    const dailyDump = "daily/backup-20260815T011700Z.dump.age";
    const dailyMetaKey = "daily/backup-20260815T011700Z.meta.json";
    const monthlyDump = "monthly/backup-20260815T011700Z.dump.age";
    const monthlyMetaKey = "monthly/backup-20260815T011700Z.meta.json";

    filesByBucketPrefix = {
      [WORKING_BUCKET]: {
        "daily/": [dailyDump, dailyMetaKey],
        "monthly/": [monthlyDump, monthlyMetaKey],
        "permanent/": [],
      },
      [ARCHIVE_BUCKET]: { "daily/": [], "monthly/": [], "permanent/": [] },
    };
    metaByKey[dailyMetaKey] = makeMeta({ tier: "daily" });
    metaByKey[monthlyMetaKey] = makeMeta({ tier: "monthly" });

    const { listBackups } = await import("../../services/backups/storage");
    const { rows } = await listBackups();

    const matching = rows.filter((r) => r.id === "20260815T011700Z");
    expect(matching).toHaveLength(1);
    expect(matching[0].tier).toBe("monthly");
  });
});

describe("listBackups: drill-verified.json marker", () => {
  beforeEach(() => {
    filesByBucketPrefix = {
      [WORKING_BUCKET]: { "daily/": [], "monthly/": [], "permanent/": [] },
      [ARCHIVE_BUCKET]: { "daily/": [], "monthly/": [], "permanent/": [] },
    };
  });

  test("absent marker resolves to null", async () => {
    markerContent = undefined;
    const { listBackups } = await import("../../services/backups/storage");
    const { drillMarker } = await listBackups();
    expect(drillMarker).toBeNull();
  });

  test("present, well-formed marker resolves to its parsed contents", async () => {
    markerContent = JSON.stringify({
      verifiedAt: "2026-08-01T07:17:00.000Z",
      artifactId: "20260801T071700Z",
      keyUsed: "A",
    });
    const { listBackups } = await import("../../services/backups/storage");
    const { drillMarker } = await listBackups();
    expect(drillMarker).toEqual({
      verifiedAt: "2026-08-01T07:17:00.000Z",
      artifactId: "20260801T071700Z",
      keyUsed: "A",
    });
  });

  test("malformed JSON is treated as absent, with one server log line", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    markerContent = "{not json";
    const { listBackups } = await import("../../services/backups/storage");
    const { drillMarker } = await listBackups();
    expect(drillMarker).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to read drill-verified.json"),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });

  test("wrong-shape JSON (missing keyUsed) is treated as absent, with one server log line", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    markerContent = JSON.stringify({ verifiedAt: "2026-08-01T07:17:00.000Z", artifactId: "20260801T071700Z" });
    const { listBackups } = await import("../../services/backups/storage");
    const { drillMarker } = await listBackups();
    expect(drillMarker).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
