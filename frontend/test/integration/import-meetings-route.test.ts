import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";

// Next's after() throws when called outside a real request scope, which route handlers
// invoked directly (not through the Next server) always are. Let the passed promise run to
// completion in the background instead of awaiting it here (see write-meeting-route.test.ts).
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (p: Promise<unknown>) => { p.catch(() => {}); },
}));

jest.mock("../../services/auth", () => ({
  requireRole: jest.fn().mockResolvedValue({
    user: { role: "SUPER_ADMIN" },
    accessToken: undefined,
  }),
}));

jest.mock("../../services/googleCalendar", () => ({
  calendarIdsForMeeting: jest.fn().mockReturnValue({}),
  createCalendarEvent: jest.fn(),
}));

// Only the network-calling half of services/zoom is mocked — resolveZoomHost (and the
// zoomHostPool it reads) stay real, since the whole point of this suite is to exercise real
// sequential host-collision avoidance against the in-memory test DB.
jest.mock("../../services/zoom", () => {
  const actual = jest.requireActual("../../services/zoom");
  return {
    ...actual,
    createZoomMeeting: jest.fn().mockResolvedValue({ zid: "fake-zid", zoomLink: "https://zoom.example/fake" }),
  };
});

function buildImportRequest(rows: Record<string, string>[]): Request {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Meetings");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), "meetings.xlsx");
  return new Request("http://localhost/api/import/meetings", { method: "POST", body: formData });
}

// zoomHostPool (services/zoom.ts) is computed once at module-load time from
// process.env.ZOOM_HOSTS, so it must be set before that module is first required —
// dynamic require() after setting the env var, not a static import, guarantees the order.
let POST: typeof import("../../app/api/import/meetings/route").POST;

beforeAll(() => {
  process.env.ZOOM_HOSTS = "only-host@icr.org";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  POST = require("../../app/api/import/meetings/route").POST;
});

afterAll(async () => {
  await disconnectTestPrismaClient();
});

test("two rows in the same batch needing a Zoom host at the same time don't collide", async () => {
  const suffix = randomUUID().slice(0, 8);
  const rowA = `Host Pool Row A ${suffix}`;
  const rowB = `Host Pool Row B ${suffix}`;

  const request = buildImportRequest([
    {
      "Meeting Name": rowA,
      Status: "Active",
      Category: "AA",
      Day: "One-time",
      Frequency: "",
      "Start Date": "12/03/2026",
      "Start Time": "7:00 PM",
      "End Time": "8:00 PM",
      "Location Type": "In Person",
      "Physical Room": "Serenity Room",
      "Zoom Room": "Serenity Room - Zoom",
      "Contact Email": "a@icr.org",
      Description: "",
    },
    {
      "Meeting Name": rowB,
      Status: "Active",
      Category: "AA",
      Day: "One-time",
      Frequency: "",
      "Start Date": "12/03/2026",
      "Start Time": "7:00 PM",
      "End Time": "8:00 PM",
      "Location Type": "In Person",
      "Physical Room": "Unity Room",
      "Zoom Room": "Unity Room - Zoom",
      "Contact Email": "b@icr.org",
      Description: "",
    },
  ]);

  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.results).toEqual([
    { meeting: rowA, status: "created" },
    { meeting: rowB, status: "created" },
  ]);
  // Different rooms and different Zoom rooms — only the shared host pool is contended, so no
  // room/zoomRoom conflict should be reported.
  expect(body.conflicts).toEqual([]);

  // The Zoom half of each row syncs in the background (after()) — give it time to finish.
  await new Promise((resolve) => setTimeout(resolve, 400));

  const prisma = getTestPrismaClient();
  const createdA = await prisma.meeting.findFirst({ where: { title: rowA } });
  const createdB = await prisma.meeting.findFirst({ where: { title: rowB } });

  const hosts = [createdA?.zoomHost, createdB?.zoomHost];
  // Exactly one row got the pool's only host; the other found it already claimed.
  expect(hosts.filter((h) => h === "only-host@icr.org")).toHaveLength(1);
  expect(hosts.filter((h) => h == null)).toHaveLength(1);

  const synced = [createdA, createdB].find((m) => m?.zoomHost === "only-host@icr.org");
  const exhausted = [createdA, createdB].find((m) => m?.zoomHost == null);
  expect(synced?.zid).toBe("fake-zid");
  expect(synced?.zoomSyncStatus).toBe("synced");
  expect(exhausted?.zoomSyncStatus).toBe("error");
  expect(exhausted?.zoomSyncError).toMatch(/pool exhausted/i);
});

test("an unparseable row is reported as errored without aborting the batch", async () => {
  const suffix = randomUUID().slice(0, 8);
  const goodRow = `Good Row ${suffix}`;

  const request = buildImportRequest([
    {
      "Meeting Name": "",
      Status: "Active",
      Category: "AA",
      Day: "One-time",
      Frequency: "",
      "Start Date": "12/04/2026",
      "Start Time": "7:00 PM",
      "End Time": "8:00 PM",
      "Location Type": "In Person",
      "Physical Room": "Serenity Room",
      "Zoom Room": "",
      "Contact Email": "a@icr.org",
      Description: "",
    },
    {
      "Meeting Name": goodRow,
      Status: "Active",
      Category: "AA",
      Day: "One-time",
      Frequency: "",
      "Start Date": "12/04/2026",
      "Start Time": "7:00 PM",
      "End Time": "8:00 PM",
      "Location Type": "In Person",
      "Physical Room": "Seeds of Hope Room",
      "Zoom Room": "",
      "Contact Email": "b@icr.org",
      Description: "",
    },
  ]);

  const response = await POST(request);
  expect(response.status).toBe(200);
  const body = await response.json();

  expect(body.results[0].status).toBe("errored");
  expect(body.results[1]).toEqual({ meeting: goodRow, status: "created" });

  const prisma = getTestPrismaClient();
  const created = await prisma.meeting.findFirst({ where: { title: goodRow } });
  expect(created).not.toBeNull();
});
