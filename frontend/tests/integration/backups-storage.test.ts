// Exercises services/backups/storage.ts against real-shaped GCS/R2 SDK responses (mocked at the
// SDK level, not at storage.ts itself) -- these are the id/key-shape bugs backups-routes.test.ts
// can't catch because it mocks storage.ts's exports wholesale.
import type { BackupMeta } from "../../types/backups";

let filesByBucketPrefix: Record<string, Record<string, string[]>> = {};
let metaByKey: Record<string, BackupMeta> = {};

const WORKING_BUCKET = "icr-db-backups-prod";
const ARCHIVE_BUCKET = "icr-db-backups-archive";

const mockGetSignedUrl = jest.fn().mockResolvedValue(["https://storage.googleapis.com/signed-url-example"]);
const mockFile = jest.fn((key: string) => ({
  download: () => Promise.resolve([Buffer.from(JSON.stringify(metaByKey[key]))]),
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

const STORAGE_VARS = {
  GCS_BACKUPS_CREDENTIALS: Buffer.from(JSON.stringify({ client_email: "a@b.com", private_key: "key", project_id: "p" })).toString("base64"),
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
