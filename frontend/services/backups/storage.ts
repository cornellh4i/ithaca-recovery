// Real listing/download-URL implementation for the Backups admin tab. Reads the same three
// storage targets the backup-db.yml/upload-backup.sh workflow actually writes to (daily/,
// monthly/, permanent/ prefixes; backup-<id>.dump.age + backup-<id>.meta.json objects), and
// computes the per-row `replicas` field the sidecar itself can never honestly claim (see
// BackupMeta's INVARIANT comment in types/backups.ts).
import { Storage } from "@google-cloud/storage";
import { ExternalAccountClient } from "google-auth-library";
import type { BaseExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/functions/oidc";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { BackupListRow, BackupMeta, BackupReplica, BackupTier, DrillVerifiedMarker } from "../../types/backups";
import { ALL_BACKUP_REPLICAS, backupArtifactBaseName } from "../../types/backups";
import { getStorageConfig } from "./config";

// INVARIANT: keyless signing requires ONE physical copy of google-auth-library in
// @google-cloud/storage's resolution path -- the direct dependency's range in package.json must
// keep overlapping @google-cloud/storage's own, or yarn nests a second copy and an internal
// `instanceof BaseExternalAccountClient` check fails at runtime only (no test catches it).
//
// GCP org policy `iam.disableServiceAccountKeyCreation` rules out a downloadable service-account
// key entirely -- auth is Vercel OIDC -> GCP Workload Identity Federation instead. The WIF
// provider trusts Vercel's OIDC issuer and exchanges the request's short-lived identity token for
// an impersonated access token on GCP_BACKUPS_SERVICE_ACCOUNT; see this file's
// `signedDownloadUrl` comment for the extra IAM role that impersonation needs for signing.
function gcsAuthClient(provider: string, serviceAccount: string): BaseExternalAccountClient {
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/${provider}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!client) throw new Error("services/backups/storage: ExternalAccountClient.fromJSON returned null -- malformed WIF config");
  return client;
}

const TIERS: BackupTier[] = ["daily", "monthly", "permanent"];
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_EXPIRY_DAYS = 21;
const MONTHLY_EXPIRY_DAYS = 407;
const CACHE_TTL_MS = 60_000;

function computeExpiresAt(tier: BackupTier, createdAt: string): string | null {
  if (tier === "permanent") return null;
  const days = tier === "daily" ? DAILY_EXPIRY_DAYS : MONTHLY_EXPIRY_DAYS;
  return new Date(new Date(createdAt).getTime() + days * DAY_MS).toISOString();
}

// Memoized per process, keyed on the two config values: rebuilding the ExternalAccountClient
// per request would discard its internal STS/impersonated-token cache, paying the full
// OIDC -> STS -> generateAccessToken exchange on every call instead of reusing a ~1h token.
// The OIDC subject token itself stays fresh -- the supplier above is invoked per refresh, not
// captured at construction.
let cachedGcs: { provider: string; serviceAccount: string; storage: Storage } | null = null;

function gcsClient(): Storage {
  const config = getStorageConfig();
  if (cachedGcs && cachedGcs.provider === config.gcpWifProvider && cachedGcs.serviceAccount === config.gcpServiceAccount) {
    return cachedGcs.storage;
  }
  const storage = new Storage({
    // The SA's own project doubles as the quota project for its STS exchanges.
    projectId: config.gcpServiceAccount.split("@")[1]?.split(".")[0] ?? "icr-management-system",
    authClient: gcsAuthClient(config.gcpWifProvider, config.gcpServiceAccount),
  });
  cachedGcs = { provider: config.gcpWifProvider, serviceAccount: config.gcpServiceAccount, storage };
  return storage;
}

function r2Client(): S3Client {
  const config = getStorageConfig();
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
}

/** Object keys (e.g. `daily/backup-<id>.dump.age`) currently present in a GCS bucket. */
async function listGcsObjectKeys(storage: Storage, bucket: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const tier of TIERS) {
    const [files] = await storage.bucket(bucket).getFiles({ prefix: `${tier}/` });
    files.forEach((f) => keys.add(f.name));
  }
  return keys;
}

async function listR2ObjectKeys(client: S3Client, bucket: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const tier of TIERS) {
    let continuationToken: string | undefined;
    do {
      const response = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: `${tier}/`, ContinuationToken: continuationToken }),
      );
      (response.Contents ?? []).forEach((obj) => {
        if (obj.Key) keys.add(obj.Key);
      });
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  }
  return keys;
}

const DRILL_MARKER_KEY = "drill-verified.json";

// A marker that's valid JSON but missing/mistyped a field must be treated as absent, not
// thrown -- a corrupt marker must never 500 the whole listing over a health-card nicety.
function isUsableDrillMarker(value: unknown): value is DrillVerifiedMarker {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Record<string, unknown>;
  return (
    typeof marker.verifiedAt === "string" &&
    !Number.isNaN(new Date(marker.verifiedAt).getTime()) &&
    typeof marker.artifactId === "string" &&
    marker.artifactId.length > 0 &&
    (marker.keyUsed === "A" || marker.keyUsed === "B")
  );
}

async function readDrillMarker(storage: Storage, bucket: string): Promise<DrillVerifiedMarker | null> {
  try {
    const [buf] = await storage.bucket(bucket).file(DRILL_MARKER_KEY).download();
    const parsed: unknown = JSON.parse(buf.toString("utf8"));
    if (!isUsableDrillMarker(parsed)) {
      throw new Error("marker JSON is missing verifiedAt/artifactId/keyUsed");
    }
    return parsed;
  } catch (error) {
    // Absent object (never drilled yet) is the overwhelmingly common case and not worth a
    // log line -- only a present-but-corrupt marker is worth flagging. The GCS client library
    // has been observed surfacing 404s as a numeric error.code, a string error.code, or a
    // numeric error.status depending on transport path, so all three are checked.
    const errObj = typeof error === "object" && error !== null ? (error as { code?: unknown; status?: unknown }) : null;
    const isNotFound = errObj !== null && (errObj.code === 404 || errObj.code === "404" || errObj.status === 404);
    if (!isNotFound) {
      console.error("services/backups/storage: failed to read drill-verified.json", error);
    }
    return null;
  }
}

const SIDECAR_READ_CONCURRENCY = 10;

const VALID_TIERS: readonly string[] = ["daily", "monthly", "permanent"];

// A sidecar that is valid JSON but missing the fields row assembly reads (id/tier/createdAt)
// must be skipped like an unparseable one, or a single corrupt object 500s the whole listing.
function isUsableSidecar(value: unknown): value is BackupMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.id === "string" &&
    meta.id.length > 0 &&
    typeof meta.tier === "string" &&
    VALID_TIERS.includes(meta.tier) &&
    typeof meta.createdAt === "string" &&
    !Number.isNaN(new Date(meta.createdAt).getTime())
  );
}

async function readGcsMetaSidecars(storage: Storage, bucket: string, keys: Set<string>): Promise<BackupMeta[]> {
  const metaKeys = Array.from(keys).filter((k) => k.endsWith(".meta.json"));
  const metas: BackupMeta[] = [];
  let skipped = 0;

  // Chunked rather than one unbounded Promise.all -- an unbounded fan-out over every sidecar
  // ever written risks GCS per-request concurrency limits as the bucket grows.
  for (let i = 0; i < metaKeys.length; i += SIDECAR_READ_CONCURRENCY) {
    const chunk = metaKeys.slice(i, i + SIDECAR_READ_CONCURRENCY);
    await Promise.all(
      chunk.map(async (key) => {
        try {
          const [buf] = await storage.bucket(bucket).file(key).download();
          const parsed: unknown = JSON.parse(buf.toString("utf8"));
          if (!isUsableSidecar(parsed)) {
            throw new Error("sidecar JSON is missing id/tier/createdAt");
          }
          metas.push(parsed);
        } catch (error) {
          skipped += 1;
          console.error(`services/backups/storage: failed to parse sidecar ${key}`, error);
        }
      }),
    );
  }
  if (skipped > 0) {
    console.error(`services/backups/storage: skipped ${skipped} unparseable sidecar(s) in listing`);
  }
  return metas;
}

/**
 * Dedupes rows by `meta.id`. On the 1st of the month, upload-backup.sh uploads the same
 * artifact to both daily/ and monthly/, so the working-bucket listing yields two sidecars for
 * one backup. Keeps the monthly-tier copy on conflict -- same bytes, but the monthly copy
 * outlives the daily one once GFS deletes the daily prefix's entry at the 21-day mark.
 */
function dedupeRowsById(rows: BackupListRow[]): BackupListRow[] {
  const byId = new Map<string, BackupListRow>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (!existing || (existing.tier !== "monthly" && row.tier === "monthly")) {
      byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

interface CachedListing {
  expiresAt: number;
  rows: BackupListRow[];
  workingKeys: Set<string>;
  archiveKeys: Set<string>;
  r2Keys: Set<string>;
  drillMarker: DrillVerifiedMarker | null;
}

let cache: CachedListing | null = null;

/** Object key an artifact is stored under within a bucket/target, given its tier. */
function artifactKey(tier: BackupTier, id: string): string {
  return `${tier}/${backupArtifactBaseName(id)}.dump.age`;
}

async function fetchListing(): Promise<CachedListing> {
  const config = getStorageConfig();
  const storage = gcsClient();
  const s3 = r2Client();

  const [workingKeys, archiveKeys, r2Keys, drillMarker] = await Promise.all([
    listGcsObjectKeys(storage, config.gcsWorkingBucket),
    listGcsObjectKeys(storage, config.gcsArchiveBucket),
    listR2ObjectKeys(s3, config.r2Bucket),
    readDrillMarker(storage, config.gcsWorkingBucket),
  ]);

  const metas = await readGcsMetaSidecars(storage, config.gcsWorkingBucket, workingKeys);

  const allRows: BackupListRow[] = metas.map((meta) => {
    // Tier comes from the sidecar's own field (the object's prefix at write time), never
    // re-derived from createdAt -- see BackupMeta's tier comment in types/backups.ts.
    const key = artifactKey(meta.tier, meta.id);
    const replicas: BackupReplica[] = ALL_BACKUP_REPLICAS.filter((replica) => {
      if (replica === "gcs-working") return workingKeys.has(key);
      if (replica === "gcs-archive") return archiveKeys.has(key);
      return r2Keys.has(key);
    });
    return {
      ...meta,
      replicas,
      expiresAt: computeExpiresAt(meta.tier, meta.createdAt),
    };
  });

  const rows = dedupeRowsById(allRows);
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { expiresAt: Date.now() + CACHE_TTL_MS, rows, workingKeys, archiveKeys, r2Keys, drillMarker };
}

/**
 * Cached (60s TTL) listing of every backup row across the three storage targets, plus the raw
 * archive/R2 key sets so callers (health route) can compute replica object counts without a
 * second round of API calls -- GCS/R2 free tiers meter listing as billable Class A ops, so an
 * idly refreshing admin tab must not re-list on every request.
 */
export async function listBackups(): Promise<{
  rows: BackupListRow[];
  archiveObjectCount: number;
  r2ObjectCount: number;
  workingObjectCount: number;
  drillMarker: DrillVerifiedMarker | null;
}> {
  if (!cache || cache.expiresAt <= Date.now()) {
    cache = await fetchListing();
  }
  const artifactSuffix = ".dump.age";
  // Count `.dump.age` keys the same way across all three targets -- counting working-bucket
  // *rows* instead would undercount whenever a sidecar fails to parse but the artifact object
  // still exists, making the working total not comparable to the archive/R2 counts.
  const workingObjectCount = Array.from(cache.workingKeys).filter((k) => k.endsWith(artifactSuffix)).length;
  const archiveObjectCount = Array.from(cache.archiveKeys).filter((k) => k.endsWith(artifactSuffix)).length;
  const r2ObjectCount = Array.from(cache.r2Keys).filter((k) => k.endsWith(artifactSuffix)).length;
  return { rows: cache.rows, archiveObjectCount, r2ObjectCount, workingObjectCount, drillMarker: cache.drillMarker };
}

// With no private key on hand, google-auth-library signs the URL by calling IAM Credentials'
// signBlob API through the impersonated access token -- GCP_BACKUPS_SERVICE_ACCOUNT must hold
// roles/iam.serviceAccountTokenCreator on *itself* (not just the WIF pool's impersonation grant)
// for that signBlob call to succeed.
export async function signedDownloadUrl(id: string, tier: BackupTier): Promise<string> {
  const config = getStorageConfig();
  const storage = gcsClient();
  const [url] = await storage
    .bucket(config.gcsWorkingBucket)
    .file(artifactKey(tier, id))
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 300 * 1000 });
  return url;
}
