import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../../../../services/auth";
import { resolveStorageMode } from "../../../../../../services/backups/config";
import { listBackups, signedDownloadUrl } from "../../../../../../services/backups/storage";
import type { BackupDownloadResponse, BackupsUnconfiguredResponse } from "../../../../../../types/backups";

const DOWNLOAD_EXPIRY_SECONDS = 300;

export const GET = async (request: NextRequest) => {
  const auth = await requireRole(Role.SUPER_ADMIN);
  if (auth instanceof Response) return auth;

  // Parsed from the pathname (matches retrieve/meeting/[id]/route.ts's idiom) rather than a
  // typed `params` argument -- avoids Next's route-context typing churn across versions.
  const segments = request.nextUrl.pathname.split("/");
  const id = segments[segments.length - 2] as string;

  const storageMode = resolveStorageMode();
  if (storageMode.mode === "unconfigured") {
    const body: BackupsUnconfiguredResponse = { configured: false, missing: storageMode.missing };
    return NextResponse.json(body, { status: 503 });
  }

  if (storageMode.mode === "mock") {
    // Mock rows regenerate anchored to the current cron slot -- an id fetched just before a
    // slot boundary would 404 against a listing generated just after it. Mock mode has no real
    // artifact to validate against anyway, so skip id-vs-listing validation entirely.
    const body: BackupDownloadResponse = { mode: "mock", url: null, expiresInSeconds: null };
    return NextResponse.json(body);
  }

  try {
    const { rows } = await listBackups();
    const row = rows.find((r) => r.id === id);
    if (!row) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (!row.replicas.includes("gcs-working")) {
      // Lifecycle-deleted or the working-bucket upload failed -- signing against a bucket that
      // doesn't hold this object would 404 downstream with no actionable message.
      return NextResponse.json(
        { error: "Backup artifact is no longer available in the working bucket (lifecycle-deleted or upload failed)." },
        { status: 409 },
      );
    }

    const url = await signedDownloadUrl(row.id, row.tier);
    // Audit trail for downloads -- the design doc's break-glass runbook says a signed URL is
    // one legitimate retrieval path, so who pulled which artifact and when must be logged.
    console.info(`backups/download: ${auth.user?.email ?? "unknown"} downloaded ${row.id}`);

    const body: BackupDownloadResponse = { mode: "live", url, expiresInSeconds: DOWNLOAD_EXPIRY_SECONDS };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Error generating backup download URL: ", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
