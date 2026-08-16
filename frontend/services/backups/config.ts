// Env contract for the real Backups admin tab backend. All vars are optional so dev/CI can run
// with zero credentials (mock mode) -- see the mode-resolution helpers below for what happens
// when they're missing in each environment.

export interface BackupsStorageConfig {
  gcpWifProvider: string;
  gcpServiceAccount: string;
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
  "GCP_BACKUPS_WIF_PROVIDER",
  "GCP_BACKUPS_SERVICE_ACCOUNT",
  "GCS_WORKING_BUCKET",
  "GCS_ARCHIVE_BUCKET",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID_READ",
  "R2_SECRET_ACCESS_KEY_READ",
  "R2_BUCKET",
] as const;

const GITHUB_VAR_NAMES = ["GITHUB_BACKUPS_PAT"] as const;

// Bare resource path, no `//iam.googleapis.com/` prefix (storage.ts adds it as the audience) --
// the most likely paste error, which would otherwise pass the presence check and 500 at STS time
// instead of 503ing with an actionable name.
const WIF_PROVIDER_SHAPE = /^projects\/\d+\/locations\/[^/]+\/workloadIdentityPools\/[^/]+\/providers\/[^/]+$/;
// A malformed SA email would build an invalid IAM impersonation URL and 500 at request time
// instead of 503ing with an actionable name -- same rationale as the provider shape above.
const SERVICE_ACCOUNT_SHAPE = /^[^@/\s]+@[^@/\s]+\.iam\.gserviceaccount\.com$/;

function missingStorageVars(): string[] {
  return STORAGE_VAR_NAMES.filter((name) => {
    const value = process.env[name];
    if (!value) return true;
    if (name === "GCP_BACKUPS_WIF_PROVIDER") return !WIF_PROVIDER_SHAPE.test(value);
    if (name === "GCP_BACKUPS_SERVICE_ACCOUNT") return !SERVICE_ACCOUNT_SHAPE.test(value);
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
  return {
    gcpWifProvider: process.env.GCP_BACKUPS_WIF_PROVIDER as string,
    gcpServiceAccount: process.env.GCP_BACKUPS_SERVICE_ACCOUNT as string,
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
