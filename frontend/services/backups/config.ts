// Env contract for the real Backups admin tab backend. All vars are optional so dev/CI can run
// with zero credentials (mock mode) -- see the mode-resolution helpers below for what happens
// when they're missing in each environment.

export interface GcsCredentials {
  clientEmail: string;
  privateKey: string;
  projectId: string;
}

export interface BackupsStorageConfig {
  gcsCredentials: GcsCredentials;
  gcsWorkingBucket: string;
  gcsArchiveBucket: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
}

export interface BackupsGithubConfig {
  pat: string;
  repo: string;
}

const STORAGE_VAR_NAMES = [
  "GCS_BACKUPS_CREDENTIALS",
  "GCS_WORKING_BUCKET",
  "GCS_ARCHIVE_BUCKET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID_READ",
  "R2_SECRET_ACCESS_KEY_READ",
  "R2_BUCKET",
] as const;

const GITHUB_VAR_NAMES = ["GITHUB_BACKUPS_PAT"] as const;

/** True only if the value decodes as base64 -> JSON with the three fields getStorageConfig() reads. */
function isDecodableGcsCredentials(raw: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, unknown>;
    return typeof decoded.client_email === "string" && typeof decoded.private_key === "string" && typeof decoded.project_id === "string";
  } catch {
    return false;
  }
}

function missingStorageVars(): string[] {
  return STORAGE_VAR_NAMES.filter((name) => {
    const value = process.env[name];
    if (!value) return true;
    // A present-but-undecodable value must count as missing, not pass the presence check and
    // 500 later inside getStorageConfig()'s JSON.parse.
    if (name === "GCS_BACKUPS_CREDENTIALS") return !isDecodableGcsCredentials(value);
    return false;
  });
}

function missingGithubVars(): string[] {
  return GITHUB_VAR_NAMES.filter((name) => !process.env[name]);
}

/** True once every storage var is present -- read live, not cached, so tests can toggle env. */
export function hasStorageConfig(): boolean {
  return missingStorageVars().length === 0;
}

/** True once every GitHub var is present. */
export function hasGithubConfig(): boolean {
  return missingGithubVars().length === 0;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolves a route's data-source mode from the vars it actually needs. "live" when configured;
 * "mock" when unconfigured outside production; a 503-shaped result (`missing` populated) when
 * unconfigured in production -- callers must check `missing.length > 0` before proceeding.
 */
export function resolveMode(missing: string[]): { mode: "live" } | { mode: "mock" } | { mode: "unconfigured"; missing: string[] } {
  if (missing.length === 0) return { mode: "live" };
  if (isProduction()) return { mode: "unconfigured", missing };
  return { mode: "mock" };
}

export function resolveStorageMode(): { mode: "live" } | { mode: "mock" } | { mode: "unconfigured"; missing: string[] } {
  return resolveMode(missingStorageVars());
}

export function resolveGithubMode(): { mode: "live" } | { mode: "mock" } | { mode: "unconfigured"; missing: string[] } {
  return resolveMode(missingGithubVars());
}

/** Combined mode for routes that need both (health's run history, activity, dispatch). */
export function resolveCombinedMode(): { mode: "live" } | { mode: "mock" } | { mode: "unconfigured"; missing: string[] } {
  return resolveMode([...missingStorageVars(), ...missingGithubVars()]);
}

export function getStorageConfig(): BackupsStorageConfig {
  const decoded = JSON.parse(Buffer.from(process.env.GCS_BACKUPS_CREDENTIALS as string, "base64").toString("utf8")) as {
    client_email: string;
    private_key: string;
    project_id: string;
  };
  return {
    gcsCredentials: {
      clientEmail: decoded.client_email,
      privateKey: decoded.private_key,
      projectId: decoded.project_id,
    },
    gcsWorkingBucket: process.env.GCS_WORKING_BUCKET as string,
    gcsArchiveBucket: process.env.GCS_ARCHIVE_BUCKET as string,
    r2AccountId: process.env.R2_ACCOUNT_ID as string,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID_READ as string,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY_READ as string,
    r2Bucket: process.env.R2_BUCKET as string,
  };
}

export function getGithubConfig(): BackupsGithubConfig {
  return {
    pat: process.env.GITHUB_BACKUPS_PAT as string,
    repo: process.env.GITHUB_BACKUPS_REPO || "cornellh4i/ithaca-recovery",
  };
}
