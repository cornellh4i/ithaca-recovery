jest.mock("../../services/auth", () => ({
  requireRole: jest.fn(),
}));

jest.mock("../../services/zoom", () => ({
  zoomHostPool: ["host1@icr.test", "host2@icr.test"],
  checkZoomHostPoolAvailability: jest.fn(),
}));

import { requireRole } from "../../services/auth";
import { checkZoomHostPoolAvailability } from "../../services/zoom";
import { GET as getZoomHosts } from "../../app/api/retrieve/zoom-hosts/route";
import { POST as checkAvailability } from "../../app/api/retrieve/zoom-host-availability/route";

const mockedRequireRole = requireRole as jest.Mock;
const mockedCheckAvailability = checkZoomHostPoolAvailability as jest.Mock;

const unauthorized = () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

describe("GET /api/retrieve/zoom-hosts", () => {
  it("returns the pool for an authorized admin", async () => {
    mockedRequireRole.mockResolvedValue({ user: { role: "ADMIN" }, accessToken: "fake-token" });

    const response = await getZoomHosts();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ hosts: ["host1@icr.test", "host2@icr.test"] });
  });

  it("rejects an unauthenticated request", async () => {
    mockedRequireRole.mockResolvedValue(unauthorized());

    const response = await getZoomHosts();
    expect(response.status).toBe(401);
  });
});

describe("POST /api/retrieve/zoom-host-availability", () => {
  beforeEach(() => {
    mockedCheckAvailability.mockReset();
    mockedRequireRole.mockResolvedValue({ user: { role: "ADMIN" }, accessToken: "fake-token" });
  });

  const request = (body: unknown) =>
    new Request("http://localhost/api/retrieve/zoom-host-availability", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("delegates to checkZoomHostPoolAvailability and returns its result", async () => {
    mockedCheckAvailability.mockResolvedValue([
      { host: "host1@icr.test", freeSlots: 1, capacity: 2 },
      { host: "host2@icr.test", freeSlots: 0, capacity: 1 },
    ]);

    const response = await checkAvailability(request({
      mid: "m-existing",
      startDateTime: "2026-10-01T18:00:00.000Z",
      endDateTime: "2026-10-01T19:00:00.000Z",
      isRecurring: false,
      recurrencePattern: null,
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      hosts: [
        { host: "host1@icr.test", freeSlots: 1, capacity: 2 },
        { host: "host2@icr.test", freeSlots: 0, capacity: 1 },
      ],
    });

    // mid is used as excludeMid, not passed through as part of the candidate.
    expect(mockedCheckAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        startDateTime: new Date("2026-10-01T18:00:00.000Z"),
        endDateTime: new Date("2026-10-01T19:00:00.000Z"),
        isRecurring: false,
      }),
      { excludeMid: "m-existing" },
    );
  });

  it("rejects an unauthenticated request without calling the service", async () => {
    mockedRequireRole.mockResolvedValue(unauthorized());

    const response = await checkAvailability(request({
      startDateTime: "2026-10-01T18:00:00.000Z",
      endDateTime: "2026-10-01T19:00:00.000Z",
      isRecurring: false,
    }));

    expect(response.status).toBe(401);
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });

  it("returns 400 with validation issues for a malformed body", async () => {
    const response = await checkAvailability(request({ isRecurring: false }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid request body");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(mockedCheckAvailability).not.toHaveBeenCalled();
  });
});
