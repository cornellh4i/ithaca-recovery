import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { resolveStorageMode } from "../../../../../services/backups/config";
import { listBackups } from "../../../../../services/backups/storage";
import { FREE_TIER_LIMITS, freshnessFor, generateMockBackupHealth, nextScheduledRunAfter } from "../../../../components/admin/backups/mockBackups";
import { ALL_BACKUP_REPLICAS } from "../../../../../types/backups";
import type { BackupHealth, BackupReplicaStatus, BackupsEnvelope, BackupsUnconfiguredResponse } from "../../../../../types/backups";

export const GET = async () => {
  const auth = await requireRole(Role.SUPER_ADMIN);
  if (auth instanceof Response) return auth;

  const storageMode = resolveStorageMode();
  if (storageMode.mode === "unconfigured") {
    const body: BackupsUnconfiguredResponse = { configured: false, missing: storageMode.missing };
    return NextResponse.json(body, { status: 503 });
  }

  const now = new Date();

  if (storageMode.mode === "mock") {
    const body: BackupsEnvelope<BackupHealth> = { mode: "mock", data: generateMockBackupHealth(now) };
    return NextResponse.json(body);
  }

  try {
    const { rows, workingObjectCount, archiveObjectCount, r2ObjectCount } = await listBackups();
    const latest = rows[0];
    const lastSuccessfulBackupAt = latest ? latest.createdAt : null;

    const objectCounts: Record<(typeof ALL_BACKUP_REPLICAS)[number], number> = {
      "gcs-working": workingObjectCount,
      "gcs-archive": archiveObjectCount,
      r2: r2ObjectCount,
    };
    const replicaStatus: BackupReplicaStatus[] = ALL_BACKUP_REPLICAS.map((replica) => ({
      replica,
      objectCount: objectCounts[replica],
      hasLatest: latest ? latest.replicas.includes(replica) : false,
    }));

    const totals = rows.reduce(
      (acc, r) => ({ objectCount: acc.objectCount + 1, totalSizeBytes: acc.totalSizeBytes + r.sizeBytes }),
      { objectCount: 0, totalSizeBytes: 0 },
    );

    const health: BackupHealth = {
      lastSuccessfulBackupAt,
      freshness: lastSuccessfulBackupAt ? freshnessFor(lastSuccessfulBackupAt, now) : "error",
      // No quarterly restore drill has run against production yet -- see
      // docs/02-handoff/backups-and-recovery.md's "Verification: restore drills" section.
      lastVerifiedRestoreAt: null,
      nextScheduledRunAt: nextScheduledRunAfter(now),
      replicaStatus,
      totals,
      freeTierLimits: FREE_TIER_LIMITS,
    };

    const body: BackupsEnvelope<BackupHealth> = { mode: "live", data: health };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Error computing backup health: ", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
