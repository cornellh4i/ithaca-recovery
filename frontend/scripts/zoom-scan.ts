// Monthly Zoom maintenance scan (.github/workflows/zoom-scan.yml; also runnable locally with
// the same env vars). Two jobs in one pass over every Zoom-enabled meeting:
//
// 1. Credential drift: compare each meeting's live Zoom passcode/join URL against the stored
//    copy and persist the result in zoomDriftDetectedAt -- the calendar badge's data source,
//    so bulk calendar paths never call Zoom themselves (GitHub #509). Detection only: adoption
//    stays with the admin-driven retry-sync route, where a human sees what changed.
// 2. Horizon re-extension: PATCH every MANAGED recurring meeting's schedule. Zoom clamps a
//    PATCHed endless (end_times: 0) type-8 series to a rolling window (~110 weekly / 60
//    monthly occurrences from the PATCH date), so a series edited never again would run out of
//    listed occurrences after ~2 years; a monthly re-PATCH keeps every horizon perpetually
//    fresh with no per-meeting bookkeeping (GitHub #508). Unmanaged meetings are never
//    PATCHed -- drift detection is the only thing the scan does to them.
//
// Uses the app's own zoom service (single source of truth for the meeting body, pinned
// zoomTopic handling included). Run via:
//   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/zoom-scan.ts
// (the condition neutralizes services/zoom.ts's "server-only" guard outside Next).
import { PrismaClient } from "@prisma/client";
import { getZoomMeetingCredentials, updateZoomMeeting } from "../services/zoom";
import type { IMeeting } from "../types/models";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function main(): Promise<void> {
  const meetings = await prisma.meeting.findMany({
    where: { deletedAt: null, zid: { not: null } },
    include: { recurrencePattern: true },
    orderBy: { title: "asc" },
  });

  // One Zoom GET per distinct zid -- shared legacy meetings serve multiple rows.
  const byZid = new Map<string, typeof meetings>();
  for (const meeting of meetings) {
    const group = byZid.get(meeting.zid as string);
    if (group) group.push(meeting);
    else byZid.set(meeting.zid as string, [meeting]);
  }

  let driftSet = 0, driftCleared = 0, extended = 0, failures = 0;

  for (const [zid, group] of byZid) {
    const live = await getZoomMeetingCredentials(zid);
    if (!live?.joinUrl) {
      // Unreachable/deleted on Zoom's side is a sync problem, not drift -- leave flags as-is
      // and let a human-driven retry surface the real error.
      console.error(`skip ${zid} (${group.map((m) => m.title).join(" + ")}): credentials unavailable`);
      failures++;
      continue;
    }

    for (const meeting of group) {
      const drift =
        live.joinUrl !== meeting.zoomLink ||
        live.passcode !== (meeting.zoomPasscode || null);
      if (drift !== (meeting.zoomDriftDetectedAt !== null)) {
        await prisma.meeting.update({
          where: { mid: meeting.mid },
          data: { zoomDriftDetectedAt: drift ? new Date() : null },
        });
        drift ? driftSet++ : driftCleared++;
        console.log(`${drift ? "DRIFT" : "clear"} ${zid} ${meeting.title}`);
      }
    }

    // updateZoomMeeting receives the OTHER rows sharing this zid, so a shared meeting's PATCH
    // sends the union of every row's schedule rather than one row's narrowed view (#513).
    const representative = group.find((m) => m.zoomManaged && m.isRecurring && m.status !== "Suspended") ?? null;
    if (representative) {
      const siblings = group.filter((m) => m !== representative);
      const ok = await updateZoomMeeting(zid, {
        ...representative,
        recurrencePattern: representative.recurrencePattern ?? null,
      } as unknown as IMeeting, siblings as unknown as IMeeting[]);
      if (ok) extended++;
      else {
        failures++;
        console.error(`horizon PATCH failed for ${zid} (${representative.title})`);
      }
    }
  }

  console.log(`scan done: ${byZid.size} zids, drift set ${driftSet} / cleared ${driftCleared}, horizons re-extended ${extended}, failures ${failures}`);
  // Failures should page (workflow goes red) but only after the whole pool was attempted.
  if (failures > 0) process.exit(1);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
