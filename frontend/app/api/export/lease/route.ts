import { Prisma, Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { defaultLeaseSettings } from "../../../../util/lease/leaseDefaults";
import { formatDayColumn } from "../../../../util/meetings/recurrenceDisplay";
import type { ILeaseSettings, IRoomRate } from "../../../../types/models";
import { LEASE_SETTINGS_ID } from "../../../../util/settings/singletonIds";
import { prisma } from "../../../../lib/prisma";
import { getETTimeOfDay } from "../../../../util/date/timeUtils";

const notDeleted = { deletedAt: null };

function determinePremiseType(room: string, zoomRoom: string | null): string {
  if (room === "Zoom Only" || room === "") return "Zoom Only";
  if (zoomRoom) return "Hybrid";
  return "In-Person Only";
}

// Remote meetings have no physical room (meeting.room === ""), so they're billed
// against the "Zoom" rate bucket instead of an unmatched empty-string key.
function getRoomRate(room: string, rooms: IRoomRate[]): IRoomRate {
  const key = room || "Zoom Only";
  return rooms.find((r) => r.room === key) ?? { room: key, rate: 10, unit: "hr" };
}

// Flat 4 weeks/month, by design -- not the yearly average (52/12). ICR bills a stable, round
// monthly rate regardless of which months a lease covers or how many times a given weekday
// lands in a specific month.
function calculateRentCharge(premiseType: string, billableHours: number, roomRate: IRoomRate): number {
  if (premiseType === "Zoom Only") return roomRate.rate;
  if (roomRate.unit === "month") return roomRate.rate;
  return 4 * billableHours * roomRate.rate;
}

function formatRoomDisplay(room: string, roomRate: IRoomRate): string {
  return `${room} ($${roomRate.rate}/${roomRate.unit})`;
}

// Meeting.startDateTime/endDateTime are real ET wall-clock instants (unlike the lease
// @db.Date fields formatLeaseDate handles below), so this reads ET, not UTC -- getUTCHours
// would show the meeting's UTC hour, off by 4-5 hours (DST-dependent) from what it's
// actually scheduled for.
function formatTime(date: Date): string {
  const { hour, minute: minutes } = getETTimeOfDay(date);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hours = hour % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
}

function calculateBillableTime(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function formatLeaseDate(date: Date): string {
  // Deliberately UTC, not ET -- lease dates are plain @db.Date calendar dates with no time
  // component (unlike Meeting.startDateTime/endDateTime), so there's no ET wall-clock to derive.
  const day = date.getUTCDate();
  // eslint-disable-next-line no-restricted-syntax -- explicit timeZone: "UTC" above, see comment
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = date.getUTCFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
}

type LeaseMeeting = Prisma.MeetingGetPayload<{ include: { recurrencePattern: true } }>;

// A #497 edit-scope split ("this" -> detached one-time row, "thisAndFollowing" -> new tail
// row) creates a second Meeting row for what is, for billing purposes, still one lease
// obligation -- root = splitFromMid ?? mid so every row in a chain (however many generations
// deep) collapses onto the ROOT series' mid, since #497 always points splitFromMid at the root,
// never at an intermediate segment.
function lineageRoot(meeting: LeaseMeeting): string {
  return meeting.splitFromMid ?? meeting.mid;
}

// Picks whichever meeting's own schedule starts latest, tie-broken by mid for a deterministic,
// arbitrary-but-stable pick -- two rows in the same lineage should never share a startDateTime
// in practice.
function latestStarting(meetings: LeaseMeeting[]): LeaseMeeting {
  return meetings.reduce((latest, candidate) => {
    const latestStart = latest.startDateTime.getTime();
    const candidateStart = candidate.startDateTime.getTime();
    if (candidateStart > latestStart) return candidate;
    if (candidateStart < latestStart) return latest;
    return candidate.mid < latest.mid ? candidate : latest;
  });
}

// One CSV row per lineage, not per Meeting row -- otherwise a split/detached series would bill
// twice for the same group. A "this and following" edit hands the series off to a new recurring
// tail row, which really is the series' current shape -- latest-starting recurring member wins.
// But a "this" edit's detached one-time child (recurrencePattern: null) is always later-starting
// than the still-recurring parent it was split from (it's anchored to the clicked occurrence
// date, not the series' original anchor), so picking by latest start across *all* members would
// make a single edited occurrence stand in for the whole ongoing series -- wrong room/day/
// duration on every future bill. Restricting the pick to recurring members fixes that; only a
// lineage with no recurring member left at all (fully one-time) falls back to latest-of-everyone.
function pickLineageRepresentative(meetings: LeaseMeeting[]): LeaseMeeting {
  const recurring = meetings.filter((m) => m.recurrencePattern !== null);
  return latestStarting(recurring.length > 0 ? recurring : meetings);
}

function groupByLineage(meetings: LeaseMeeting[]): LeaseMeeting[] {
  const groups = new Map<string, LeaseMeeting[]>();
  for (const meeting of meetings) {
    const root = lineageRoot(meeting);
    const group = groups.get(root);
    if (group) group.push(meeting);
    else groups.set(root, [meeting]);
  }
  return Array.from(groups.values()).map(pickLineageRepresentative);
}

function toCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const header = Object.keys(rows[0]);
  const escape = (value: string) => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => escape(row[key])).join(","));
  }
  return lines.join("\n");
}

export const GET = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const stored = await prisma.leaseSettings.findUnique({ where: { id: LEASE_SETTINGS_ID } });
    const settings: ILeaseSettings = stored
      ? { ...stored, rooms: stored.rooms as unknown as IRoomRate[] }
      : defaultLeaseSettings();

    // Deliberately not filtered by status: "Active" -- a Suspended meeting's lease obligation
    // doesn't end just because its calendar visibility is toggled off (suspend hides/pauses,
    // it doesn't terminate the group's agreement). Only deletedAt excludes a meeting here.
    const meetings = await prisma.meeting.findMany({
      where: notDeleted,
      include: { recurrencePattern: true },
      orderBy: { title: "asc" },
    });

    if (meetings.length === 0) {
      return new Response(JSON.stringify({ error: "No meetings to export." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const leaseStart = new Date(settings.leaseStartDate);
    const leaseEnd = new Date(settings.leaseEndDate);

    // Collapse split/detached rows onto one representative per lineage before building CSV
    // rows, then re-sort -- grouping can promote a row whose title differs from the one the
    // original title-ordered query put first.
    const billableMeetings = groupByLineage(meetings).sort((a, b) => a.title.localeCompare(b.title));

    const rows = billableMeetings.map((meeting) => {
      const start = meeting.startDateTime;
      const end = meeting.endDateTime;
      const billableTime = calculateBillableTime(start, end);
      const premiseType = determinePremiseType(meeting.room, meeting.zoomRoom);
      const roomRate = getRoomRate(meeting.room, settings.rooms);
      const rentCharge = calculateRentCharge(premiseType, billableTime, roomRate);
      const emailMessage = settings.emailTemplate.replace(/\{group\}/g, meeting.title);

      return {
        DocumentTitle: `Lease - ${meeting.title}`,
        "Client.City": "Ithaca",
        "Client.Company": meeting.title,
        "Client.Country": "US",
        "Client.Email": meeting.email,
        "Client.PostalCode": "14850",
        "Client.State": "NY",
        "Client.StreetAddress": "518 W Seneca St",
        "Rental Agent.City": settings.agentCity,
        "Rental Agent.Company": "Ithaca Community Recovery",
        "Rental Agent.Country": "US",
        "Rental Agent.Email": settings.agentEmail,
        "Rental Agent.FirstName": settings.agentFirstName,
        "Rental Agent.LastName": settings.agentLastName,
        "Rental Agent.Phone": settings.agentPhone,
        "Rental Agent.PostalCode": settings.agentZip,
        "Rental Agent.State": settings.agentState,
        "Rental Agent.StreetAddress": settings.agentStreetAddress,
        "Rental Agent.Title": settings.agentTitle,
        "Billable Time": billableTime.toString(),
        "Business Meeting": "",
        "Group Name": meeting.title,
        "Lease End Date": formatLeaseDate(leaseEnd),
        "Lease Start Date": formatLeaseDate(leaseStart),
        "Meeting Day": formatDayColumn(meeting.recurrencePattern),
        "Meeting Type": meeting.calType.join(", "),
        "Premise and Use": premiseType,
        "Rent Charge": `$${rentCharge.toFixed(2)}`,
        Room: formatRoomDisplay(roomRate.room, roomRate),
        "Start Time": formatTime(start),
        "End Time": formatTime(end),
        EmailMessage: emailMessage,
      };
    });

    const csv = toCSV(rows);
    const filename = `${leaseStart.getUTCFullYear()} - ${leaseEnd.getUTCFullYear()} Bulk Send Lease.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8;",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting lease CSV:", error);
    return new Response(JSON.stringify({ error: "Error exporting lease CSV" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
