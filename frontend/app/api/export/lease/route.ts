import { Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";
import { defaultLeaseSettings } from "../../../../util/leaseDefaults";
import { formatDayColumn } from "../../../../util/recurrenceDisplay";
import type { ILeaseSettings, IRoomRate } from "../../../../util/models";
import { prisma } from "../../../../lib/prisma";

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

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

function calculateRentCharge(premiseType: string, billableHours: number, roomRate: IRoomRate): number {
  if (premiseType === "Zoom Only") return roomRate.rate;
  if (roomRate.unit === "month") return roomRate.rate;
  return 4 * billableHours * roomRate.rate;
}

function formatRoomDisplay(room: string, roomRate: IRoomRate): string {
  return `${room} ($${roomRate.rate}/${roomRate.unit})`;
}

function formatTime(date: Date): string {
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minutesStr} ${ampm}`;
}

function calculateBillableTime(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function formatLeaseDate(date: Date): string {
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = date.getUTCFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
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

    const stored = await prisma.leaseSettings.findFirst();
    const settings: ILeaseSettings = stored
      ? { ...stored, rooms: stored.rooms as unknown as IRoomRate[] }
      : defaultLeaseSettings();

    const meetings = await prisma.meeting.findMany({
      where: { ...notDeleted, status: "Active" },
      include: { recurrencePattern: true },
      orderBy: { title: "asc" },
    });

    if (meetings.length === 0) {
      return new Response(JSON.stringify({ error: "No active meetings to export." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const leaseStart = new Date(settings.leaseStartDate);
    const leaseEnd = new Date(settings.leaseEndDate);

    const rows = meetings.map((meeting) => {
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
