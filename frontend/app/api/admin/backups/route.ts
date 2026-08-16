import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../services/auth";
import { resolveStorageMode, resolveGithubMode } from "../../../../services/backups/config";
import { listBackups } from "../../../../services/backups/storage";
import { dispatchBackup } from "../../../../services/backups/githubRuns";
import { generateMockBackupRows } from "../../../components/admin/backups/mockBackups";
import type { BackupDispatchResponse, BackupListResponse, BackupsEnvelope, BackupsUnconfiguredResponse } from "../../../../types/backups";

const MAX_REASON_LENGTH = 200;

export const GET = async () => {
  const auth = await requireRole(Role.SUPER_ADMIN);
  if (auth instanceof Response) return auth;

  const storageMode = resolveStorageMode();
  if (storageMode.mode === "unconfigured") {
    const body: BackupsUnconfiguredResponse = { configured: false, missing: storageMode.missing };
    return NextResponse.json(body, { status: 503 });
  }

  if (storageMode.mode === "mock") {
    const rows = generateMockBackupRows(new Date());
    const body: BackupsEnvelope<BackupListResponse> = { mode: "mock", data: { rows, total: rows.length } };
    return NextResponse.json(body);
  }

  try {
    const { rows } = await listBackups();
    const body: BackupsEnvelope<BackupListResponse> = { mode: "live", data: { rows, total: rows.length } };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Error listing backups: ", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};

export const POST = async (request: Request) => {
  const auth = await requireRole(Role.SUPER_ADMIN);
  if (auth instanceof Response) return auth;

  let reasonInput: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    if (body.reason !== undefined) {
      if (typeof body.reason !== "string" || body.reason.length > MAX_REASON_LENGTH) {
        return NextResponse.json({ error: `reason must be a string of at most ${MAX_REASON_LENGTH} characters` }, { status: 400 });
      }
      reasonInput = body.reason;
    }
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const githubMode = resolveGithubMode();
  if (githubMode.mode === "unconfigured") {
    const body: BackupsUnconfiguredResponse = { configured: false, missing: githubMode.missing };
    return NextResponse.json(body, { status: 503 });
  }

  const callerEmail = auth.user?.email ?? "unknown";
  const reason = reasonInput ?? `Manual from Admin → Backups by ${callerEmail}`;

  if (githubMode.mode === "mock") {
    const body: BackupDispatchResponse = { mode: "mock", dispatched: true, triggeredBy: callerEmail };
    return NextResponse.json(body);
  }

  try {
    await dispatchBackup(reason);
    const body: BackupDispatchResponse = { mode: "live", dispatched: true, triggeredBy: callerEmail };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Error dispatching backup workflow: ", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
