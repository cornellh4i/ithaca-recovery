import * as XLSX from "xlsx";
import { PrismaClient, Role } from "@prisma/client";
import { requireRole } from "../../../../services/auth";

const prisma = new PrismaClient();

const notDeleted = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };

function formatSchedule(meeting: Awaited<ReturnType<typeof loadMeetings>>[number]): string {
  if (!meeting.recurrencePattern) return "One-time";
  const p = meeting.recurrencePattern;
  const days = (p.daysOfWeek ?? []).join(", ");
  if (p.type === "monthly") {
    return `Monthly${p.weekOfMonth != null ? ` (week ${p.weekOfMonth})` : ""}${p.dayOfMonth != null ? ` (day ${p.dayOfMonth})` : ""}`;
  }
  return `Weekly${days ? ` (${days})` : ""}${p.interval > 1 ? ` every ${p.interval} weeks` : ""}`;
}

async function loadMeetings() {
  return prisma.meeting.findMany({
    where: notDeleted,
    include: { recurrencePattern: true },
    orderBy: { startDateTime: "asc" },
  });
}

export const GET = async () => {
  try {
    const auth = await requireRole(Role.SUPER_ADMIN);
    if (auth instanceof Response) return auth;

    const meetings = await loadMeetings();

    const rows = meetings.map((meeting) => ({
      Title: meeting.title,
      Group: meeting.group,
      Status: meeting.status ?? "Active",
      Category: meeting.calType.join(", "),
      Mode: meeting.modeType,
      Room: meeting.room,
      "Zoom Account": meeting.zoomAccount ?? "",
      "Zoom Link": meeting.zoomLink ?? "",
      "Contact Email": meeting.email,
      "Start Date/Time": meeting.startDateTime.toISOString(),
      "End Date/Time": meeting.endDateTime.toISOString(),
      Recurring: meeting.isRecurring ? "Yes" : "No",
      Schedule: formatSchedule(meeting),
      Description: meeting.description,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Meetings");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const filename = `ithaca-recovery-meetings-${date}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting meetings:", error);
    return new Response(JSON.stringify({ error: "Error exporting meetings" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
