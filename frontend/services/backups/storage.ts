// Real listing/download-URL implementation for the Backups admin tab. Reads the same three
// storage targets the backup-db.yml/upload-backup.sh workflow actually writes to (daily/,
// monthly/, permanent/ prefixes; <id>.dump.age + <id>.meta.json objects), and computes the
// per-row `replicas` field the sidecar itself can never honestly claim (see BackupMeta's
// INVARIANT comment in types/backups.ts).
import { Storage } from "@google-cloud/storage";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { BackupListRow, BackupMeta, BackupReplica, BackupTier } from "../../types/backups";
import { ALL_BACKUP_REPLICAS } from "../../types/backups";
import { getStorageConfig } from "./config";

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

function gcsClient(): Storage {
  const config = getStorageConfig();
  return new Storage({
    projectId: config.gcsCredentials.projectId,
    credentials: {
      client_email: config.gcsCredentials.clientEmail,
      private_key: config.gcsCredentials.privateKey,
    },
  });
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

/** Object keys (e.g. `daily/<id>.dump.age`) currently present in a GCS bucket. */
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

async function readGcsMetaSidecars(storage: Storage, bucket: string, keys: Set<string>): Promise<BackupMeta[]> {
  const metaKeys = Array.from(keys).filter((k) => k.endsWith(".meta.json"));
  const metas: BackupMeta[] = [];
  let skipped = 0;
  await Promise.all(
    metaKeys.map(async (key) => {
      try {
        const [buf] = await storage.bucket(bucket).file(key).download();
        metas.push(JSON.parse(buf.toString("utf8")) as BackupMeta);
      } catch (error) {
        skipped += 1;
        console.error(`services/backups/storage: failed to parse sidecar ${key}`, error);
      }
    }),
  );
  if (skipped > 0) {
    console.error(`services/backups/storage: skipped ${skipped} unparseable sidecar(s) in listing`);
  }
  return metas;
}

interface CachedListing {
  expiresAt: number;
  rows: BackupListRow[];
  archiveKeys: Set<string>;
  r2Keys: Set<string>;
}

let cache: CachedListing | null = null;

/** Object key an artifact is stored under within a bucket/target, given its tier. */
function artifactKey(tier: BackupTier, id: string): string {
  return `${tier}/${id}.dump.age`;
}

async function fetchListing(): Promise<CachedListing> {
  const config = getStorageConfig();
  const storage = gcsClient();
  const s3 = r2Client();

  const [workingKeys, archiveKeys, r2Keys] = await Promise.all([
    listGcsObjectKeys(storage, config.gcsWorkingBucket),
    listGcsObjectKeys(storage, config.gcsArchiveBucket),
    listR2ObjectKeys(s3, config.r2Bucket),
  ]);

  const metas = await readGcsMetaSidecars(storage, config.gcsWorkingBucket, workingKeys);

  const rows: BackupListRow[] = metas.map((meta) => {
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

  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { expiresAt: Date.now() + CACHE_TTL_MS, rows, archiveKeys, r2Keys };
}

/**
 * Cached (60s TTL) listing of every backup row across the three storage targets, plus the raw
 * archive/R2 key sets so callers (health route) can compute replica object counts without a
 * second round of API calls -- GCS/R2 free tiers meter listing as billable Class A ops, so an
 * idly refreshing admin tab must not re-list on every request.
 */
export async function listBackups(): Promise<{ rows: BackupListRow[]; archiveObjectCount: number; r2ObjectCount: number; workingObjectCount: number }> {
  if (!cache || cache.expiresAt <= Date.now()) {
    cache = await fetchListing();
  }
  const artifactSuffix = ".dump.age";
  const workingObjectCount = cache.rows.filter((r) => r.replicas.includes("gcs-working")).length;
  const archiveObjectCount = Array.from(cache.archiveKeys).filter((k) => k.endsWith(artifactSuffix)).length;
  const r2ObjectCount = Array.from(cache.r2Keys).filter((k) => k.endsWith(artifactSuffix)).length;
  return { rows: cache.rows, archiveObjectCount, r2ObjectCount, workingObjectCount };
}

export async function signedDownloadUrl(id: string, tier: BackupTier): Promise<string> {
  const config = getStorageConfig();
  const storage = gcsClient();
  const [url] = await storage
    .bucket(config.gcsWorkingBucket)
    .file(artifactKey(tier, id))
    .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 300 * 1000 });
  return url;
}
