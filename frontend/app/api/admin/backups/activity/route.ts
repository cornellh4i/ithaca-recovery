import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireRole } from "../../../../../services/auth";
import { resolveGithubMode } from "../../../../../services/backups/config";
import { fetchRecentActivity } from "../../../../../services/backups/githubRuns";
import { generateMockActivityEvents } from "../../../../components/admin/backups/mockBackups";
import type { ActivityListResponse, BackupsEnvelope, BackupsUnconfiguredResponse } from "../../../../../types/backups";

export const GET = async () => {
  const auth = await requireRole(Role.SUPER_ADMIN);
  if (auth instanceof Response) return auth;

  const githubMode = resolveGithubMode();
  if (githubMode.mode === "unconfigured") {
    const body: BackupsUnconfiguredResponse = { configured: false, missing: githubMode.missing };
    return NextResponse.json(body, { status: 503 });
  }

  if (githubMode.mode === "mock") {
    const body: BackupsEnvelope<ActivityListResponse> = { mode: "mock", data: { events: generateMockActivityEvents(new Date()) } };
    return NextResponse.json(body);
  }

  try {
    const events = await fetchRecentActivity();
    const body: BackupsEnvelope<ActivityListResponse> = { mode: "live", data: { events } };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Error fetching backup workflow run history: ", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
