import type {
  createZoomMeeting as CreateZoomMeetingFn,
  updateZoomMeeting as UpdateZoomMeetingFn,
  checkZoomReachable as CheckZoomReachableFn,
} from "../../services/zoom";
import type { IMeeting } from "../../types/models";

// toZoomStartTime and buildZoomMeetingBody aren't exported (they're internal to every
// create/update call), so they're exercised the same way zoomTokenCache.test.ts exercises the
// module's other internals: through a public entry point, inspecting the outgoing fetch body.
// Covers what zoomTokenCache.test.ts (caching/coalescing/401-invalidation) deliberately leaves
// out -- the request-shaping math itself, and token-*fetch*-failure paths (non-2xx, network
// error, malformed response) as opposed to cache-behavior paths.
let createZoomMeeting: typeof CreateZoomMeetingFn;
let updateZoomMeeting: typeof UpdateZoomMeetingFn;
let checkZoomReachable: typeof CheckZoomReachableFn;

const originalFetch = global.fetch;
const ENV_KEYS = ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_ACCOUNT_ID"] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(async () => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.ZOOM_CLIENT_ID = "test-client-id";
  process.env.ZOOM_CLIENT_SECRET = "test-client-secret";
  process.env.ZOOM_ACCOUNT_ID = "test-account-id";

  // Module-level token cache -- fresh module instance per test, same as zoomTokenCache.test.ts.
  jest.resetModules();
  ({ createZoomMeeting, updateZoomMeeting, checkZoomReachable } = await import("../../services/zoom"));
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function buildMeeting(overrides: Partial<IMeeting> = {}): IMeeting {
  return {
    title: "Test Meeting",
    mid: "m-1",
    description: "A test meeting",
    creator: "creator@test.icr",
    group: "Group",
    startDateTime: new Date("2026-03-10T22:00:00.000Z"),
    endDateTime: new Date("2026-03-10T23:00:00.000Z"),
    email: "test@test.icr",
    calType: ["AA"],
    modeType: "Virtual",
    room: "Zoom",
    isRecurring: false,
    ...overrides,
  };
}

// Mocks fetch to succeed on the token endpoint (by default) and record the JSON body sent to
// whichever Zoom meetings-API call the test triggers.
function mockFetchCapturingBody(opts: { tokenOk?: boolean; tokenStatus?: number } = {}) {
  let capturedBody: Record<string, unknown> | undefined;
  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes("oauth/token")) {
      const ok = opts.tokenOk ?? true;
      return Promise.resolve({
        ok,
        status: opts.tokenStatus ?? (ok ? 200 : 500),
        json: async () => ({ access_token: "tok-1", expires_in: 3600 }),
      });
    }
    capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ id: 123, join_url: "https://zoom.us/j/123", password: "pw" }),
      text: async () => "",
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { getCapturedBody: () => capturedBody, fetchMock };
}

describe("toZoomStartTime / buildZoomMeetingBody (via createZoomMeeting's request body)", () => {
  it("sends the ET wall-clock start time (not the UTC instant) as start_time", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    // 2026-03-10T22:00:00Z is 2026-03-10 18:00 ET (already EDT that year -- DST starts March 8).
    const meeting = buildMeeting({
      startDateTime: new Date("2026-03-10T22:00:00.000Z"),
      endDateTime: new Date("2026-03-10T23:00:00.000Z"),
    });

    await createZoomMeeting(meeting, "host@test.icr");

    const body = getCapturedBody();
    expect(body?.start_time).toBe("2026-03-10T18:00:00");
    expect(body?.timezone).toBe("America/New_York");
  });

  it("computes duration in whole minutes from the meeting's start/end", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      startDateTime: new Date("2026-03-10T22:00:00.000Z"),
      endDateTime: new Date("2026-03-10T23:30:00.000Z"), // 90 minutes
    });

    await createZoomMeeting(meeting, "host@test.icr");

    expect(getCapturedBody()?.duration).toBe(90);
  });

  it("rounds a fractional-minute duration to the nearest whole minute", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      startDateTime: new Date("2026-03-10T22:00:00.000Z"),
      // 5 minutes 30 seconds -> 5.5 minutes, Math.round rounds to 6.
      endDateTime: new Date("2026-03-10T22:05:30.000Z"),
    });

    await createZoomMeeting(meeting, "host@test.icr");

    expect(getCapturedBody()?.duration).toBe(6);
  });

  it("carries the meeting's title/description into topic/agenda and fixes type: 2 (reused stable meeting)", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({ title: "Wednesday AA", description: "Weekly meeting" });

    await createZoomMeeting(meeting, "host@test.icr");

    const body = getCapturedBody();
    expect(body?.topic).toBe("Wednesday AA");
    expect(body?.agenda).toBe("Weekly meeting");
    expect(body?.type).toBe(2);
  });

  it("builds the same request body shape for updateZoomMeeting as for createZoomMeeting", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      startDateTime: new Date("2026-03-10T22:00:00.000Z"),
      endDateTime: new Date("2026-03-10T23:15:00.000Z"), // 75 minutes
    });

    await updateZoomMeeting("zid-1", meeting);

    const body = getCapturedBody();
    expect(body?.start_time).toBe("2026-03-10T18:00:00");
    expect(body?.duration).toBe(75);
  });
});

describe("token-fetch failure paths", () => {
  it("returns null/false without throwing when Zoom credentials aren't configured", async () => {
    delete process.env.ZOOM_CLIENT_ID;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createZoomMeeting(buildMeeting(), "host@test.icr");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false when the token endpoint responds with a non-2xx status", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: async () => ({}) }),
    ) as unknown as typeof fetch;

    const reachable = await checkZoomReachable();

    expect(reachable).toBe(false);
  });

  it("returns null without throwing when the token request itself rejects (network error)", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;

    const result = await createZoomMeeting(buildMeeting(), "host@test.icr");

    expect(result).toBeNull();
  });

  it("returns null when the token endpoint responds 200 but omits access_token", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ expires_in: 3600 }) }),
    ) as unknown as typeof fetch;

    const result = await createZoomMeeting(buildMeeting(), "host@test.icr");

    expect(result).toBeNull();
  });

  it("does not attempt the meetings-API call at all when the token fetch fails", async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes("oauth/token")) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      throw new Error("should not reach the meetings API without a token");
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await createZoomMeeting(buildMeeting(), "host@test.icr");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the token attempt
  });
});
