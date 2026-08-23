import type {
  createZoomMeeting as CreateZoomMeetingFn,
  updateZoomMeeting as UpdateZoomMeetingFn,
  rehostZoomMeeting as RehostZoomMeetingFn,
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
let rehostZoomMeeting: typeof RehostZoomMeetingFn;
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
  ({ createZoomMeeting, updateZoomMeeting, rehostZoomMeeting, checkZoomReachable } = await import("../../services/zoom"));
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

// Mocks fetch to succeed on the token endpoint and record the JSON body sent to whichever Zoom
// meetings-API call the test triggers. Token-fetch failure paths are covered separately below,
// each with its own inline fetch mock.
function mockFetchCapturingBody() {
  let capturedBody: Record<string, unknown> | undefined;
  const fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes("oauth/token")) {
      return Promise.resolve({
        ok: true,
        status: 200,
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

  it("rounds a fractional-minute duration to the nearest whole minute, not ceil", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      startDateTime: new Date("2026-03-10T22:00:00.000Z"),
      // 5 minutes 20 seconds -> 5.33 minutes: Math.round gives 5, Math.ceil would give 6 --
      // 5.5 (5m30s) can't distinguish the two, since both round and ceil agree on it.
      endDateTime: new Date("2026-03-10T22:05:20.000Z"),
    });

    await createZoomMeeting(meeting, "host@test.icr");

    expect(getCapturedBody()?.duration).toBe(5);
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

describe("type-8 recurrence mapping (via createZoomMeeting's request body)", () => {
  it("sends a never-ending weekly multi-day series as type 8 with weekly_days and end_times 0", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      isRecurring: true,
      recurrencePattern: {
        type: "weekly", startDate: new Date("2026-07-01T23:00:00.000Z"), endDate: null,
        daysOfWeek: ["Monday", "Wednesday", "Friday"], firstDayOfWeek: "Sunday", interval: 1,
      },
    });

    await createZoomMeeting(meeting, "host@test.icr");

    const body = getCapturedBody();
    expect(body?.type).toBe(8);
    expect(body?.recurrence).toEqual({ type: 2, repeat_interval: 1, weekly_days: "2,4,6", end_times: 0 });
  });

  it("maps a week-of-month monthly pattern to Zoom's monthly_week/monthly_week_day", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      isRecurring: true,
      recurrencePattern: {
        type: "monthly", startDate: new Date("2026-07-07T21:30:00.000Z"), endDate: null,
        daysOfWeek: ["Tuesday"], weekOfMonth: 1, firstDayOfWeek: "Sunday", interval: 1,
      },
    });

    await createZoomMeeting(meeting, "host@test.icr");

    expect(getCapturedBody()?.recurrence).toEqual({ type: 3, repeat_interval: 1, monthly_week: 1, monthly_week_day: 3, end_times: 0 });
  });

  it("caps a count-bounded series at Zoom's 50-occurrence limit without failing the create", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({
      isRecurring: true,
      recurrencePattern: {
        type: "weekly", startDate: new Date("2026-07-01T23:00:00.000Z"), endDate: null,
        numberOfOccurrences: 200, daysOfWeek: ["Wednesday"], firstDayOfWeek: "Sunday", interval: 1,
      },
    });

    await createZoomMeeting(meeting, "host@test.icr");

    expect(getCapturedBody()?.recurrence).toMatchObject({ end_times: 50 });
  });

  it("clamps a backdated series' start_time to its next future occurrence", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    // Anchored far in the past; the recurrence is every Wednesday 19:00-20:00 ET.
    const meeting = buildMeeting({
      isRecurring: true,
      startDateTime: new Date("2026-07-01T23:00:00.000Z"),
      endDateTime: new Date("2026-07-02T00:00:00.000Z"),
      recurrencePattern: {
        type: "weekly", startDate: new Date("2026-07-01T23:00:00.000Z"), endDate: null,
        daysOfWeek: ["Wednesday"], firstDayOfWeek: "Sunday", interval: 1,
      },
    });

    await createZoomMeeting(meeting, "host@test.icr");

    const body = getCapturedBody();
    // Whatever today is, the sent start must not be the backdated July 1 anchor and must be
    // in the future (as an ET wall-clock string at the series' 19:00 time).
    expect(body?.start_time).not.toBe("2026-07-01T19:00:00");
    expect(String(body?.start_time)).toMatch(/T19:00:00$/);
    expect(new Date(`${body?.start_time}-04:00`).getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
  });

  it("keeps a one-time meeting as plain type 2 with no recurrence", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const meeting = buildMeeting({ isRecurring: false });

    await createZoomMeeting(meeting, "host@test.icr");

    const body = getCapturedBody();
    expect(body?.type).toBe(2);
    expect(body?.recurrence).toBeUndefined();
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

describe("rehostZoomMeeting (#516)", () => {
  it("PATCHes only schedule_for, so the meeting's identity and schedule survive the transfer", async () => {
    const { getCapturedBody, fetchMock } = mockFetchCapturingBody();

    const moved = await rehostZoomMeeting("70000000901", "518board@gmail.com");

    expect(moved).toBe(true);
    expect(getCapturedBody()).toEqual({ schedule_for: "518board@gmail.com" });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain("/meetings/70000000901");
    expect(init?.method).toBe("PATCH");
  });

  it("returns false when Zoom refuses the transfer (no scheduling privilege, basic-tier host)", async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes("oauth/token")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ access_token: "tok-1", expires_in: 3600 }) });
      }
      return Promise.resolve({ ok: false, status: 400, text: async () => "Invalid schedule_for" });
    }) as unknown as typeof fetch;

    expect(await rehostZoomMeeting("70000000902", "518icrzoom@gmail.com")).toBe(false);
  });
});

describe("shared-zid union schedules (#513, via updateZoomMeeting's request body)", () => {
  // Only Hybrid/Remote rows ever share a Zoom meeting -- an In-Person row holds no zid and is
  // filtered out of the union (see the linked-family tests below).
  const weeklyRow = (days: string[], overrides: Partial<IMeeting> = {}): IMeeting => buildMeeting({
    isRecurring: true,
    modeType: "Hybrid",
    recurrencePattern: {
      type: "weekly", startDate: new Date("2026-07-01T23:00:00.000Z"), endDate: null,
      daysOfWeek: days, firstDayOfWeek: "Sunday", interval: 1,
    },
    ...overrides,
  });

  it("sends the union of all sharing rows' weekdays, not the edited row's alone", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const edited = weeklyRow(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
    const sunday = weeklyRow(["Sunday"], { mid: "m-2", modeType: "Remote", startDateTime: new Date("2026-07-05T22:00:00.000Z"), endDateTime: new Date("2026-07-05T23:00:00.000Z") });

    await updateZoomMeeting("zid-shared", edited, [sunday]);

    const body = getCapturedBody();
    expect(body?.type).toBe(8);
    expect(body?.recurrence).toEqual({ type: 2, repeat_interval: 1, weekly_days: "1,2,3,4,5,6,7", end_times: 0 });
  });

  it("sends a schedule-neutral body when sharing rows diverge, instead of narrowing Zoom's union", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const edited = weeklyRow(["Monday"]);
    // Same weekday shape but a different time-of-day -- not representable as one series.
    const divergent = weeklyRow(["Sunday"], {
      mid: "m-2",
      startDateTime: new Date("2026-07-05T20:00:00.000Z"),
      endDateTime: new Date("2026-07-05T21:00:00.000Z"),
    });

    await updateZoomMeeting("zid-shared", edited, [divergent]);

    const body = getCapturedBody();
    expect(body?.type).toBeUndefined();
    expect(body?.recurrence).toBeUndefined();
    expect(body?.start_time).toBeUndefined();
    expect(body?.topic).toBeDefined();
  });
});

// One meeting run as two linked schedules (util/meetings/linkedSchedules.ts) is served by ONE
// Zoom meeting, so its Zoom name has to say which mode meets on which days, and its recurrence
// must cover only the schedules that actually meet online.
describe("linked-schedule family topics and recurrence (via the outgoing request body)", () => {
  const familyRow = (mid: string, modeType: string, days: string[], overrides: Partial<IMeeting> = {}): IMeeting =>
    buildMeeting({
      mid,
      modeType,
      title: "One Day at a Time",
      isRecurring: true,
      startDateTime: new Date("2026-07-01T23:00:00.000Z"),
      endDateTime: new Date("2026-07-02T00:00:00.000Z"),
      recurrencePattern: {
        type: "weekly", startDate: new Date("2026-07-01T23:00:00.000Z"), endDate: null,
        daysOfWeek: days, firstDayOfWeek: "Sunday", interval: 1,
      },
      ...overrides,
    });

  const hybridWeekdays = () => familyRow("m-hybrid", "Hybrid", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const remoteSaturday = () => familyRow("m-remote", "Remote", ["Saturday"]);

  it("names each mode with its own days for a Hybrid + Remote family", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const hybrid = hybridWeekdays();

    await updateZoomMeeting("zid-shared", hybrid, [hybrid, remoteSaturday()]);

    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat");
  });

  it("names a Hybrid + In Person family, whose In-Person member holds no Zoom link of its own", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const hybrid = familyRow("m-hybrid", "Hybrid", ["Monday", "Tuesday", "Wednesday"]);
    const inPerson = familyRow("m-inperson", "In Person", ["Thursday", "Friday"]);

    await updateZoomMeeting("zid-shared", hybrid, [hybrid, inPerson]);

    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Hybrid Mon-Wed - In Person Thu-Fri");
  });

  it("names an In Person + Remote family from the Remote member that holds the Zoom meeting", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const inPerson = familyRow("m-inperson", "In Person", ["Saturday"]);
    const remote = familyRow("m-remote", "Remote", ["Sunday"]);

    await updateZoomMeeting("zid-shared", remote, [inPerson, remote]);

    expect(getCapturedBody()?.topic).toBe("One Day at a Time - In Person Sat - Zoom Only Sun");
  });

  it("orders segments Hybrid / In Person / Remote regardless of the family's own order", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const hybrid = hybridWeekdays();
    const remote = remoteSaturday();

    // Written from the Remote member, with the family listed Remote-first: the name must not
    // depend on which row triggered the write or how the rows came back from the database.
    await updateZoomMeeting("zid-shared", remote, [remote, hybrid]);

    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat");
  });

  it("leaves a single-schedule meeting's topic byte-identical to the mode suffix it has today", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const remote = familyRow("m-1", "Remote", ["Monday"]);

    await createZoomMeeting(remote, "host@test.icr");
    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Zoom Only");

    // A family of one (the overwhelmingly common case, as getLinkedFamily returns it) is the
    // same path -- no hierarchy, no trailing day label.
    await createZoomMeeting(remote, "host@test.icr", [remote]);
    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Zoom Only");

    const hybrid = familyRow("m-1", "Hybrid", ["Monday"]);
    await createZoomMeeting(hybrid, "host@test.icr", [hybrid]);
    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Hybrid");

    const inPerson = familyRow("m-1", "In Person", ["Monday"]);
    await createZoomMeeting(inPerson, "host@test.icr", [inPerson]);
    expect(getCapturedBody()?.topic).toBe("One Day at a Time");
  });

  it("keeps a pinned zoomTopic verbatim even for a linked family", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const hybrid = hybridWeekdays();

    await updateZoomMeeting("zid-shared", { ...hybrid, zoomTopic: "ICR Legacy Zoom Name" }, [hybrid, remoteSaturday()]);

    expect(getCapturedBody()?.topic).toBe("ICR Legacy Zoom Name");
  });

  it("keeps the single-schedule name when the extra rows are the same mode (a scoped edit's split children)", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const parent = hybridWeekdays();
    const splitChild = familyRow("m-split", "Hybrid", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);

    await updateZoomMeeting("zid-shared", parent, [parent, splitChild]);

    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Hybrid");
  });

  it("excludes an In-Person member's weekdays from Zoom's recurrence union", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const hybrid = hybridWeekdays();
    const inPerson = familyRow("m-inperson", "In Person", ["Saturday"]);

    await updateZoomMeeting("zid-shared", hybrid, [hybrid, inPerson]);

    const body = getCapturedBody();
    // Mon-Fri only: Saturday meets in person, so Zoom must not list an occurrence for it.
    expect(body?.recurrence).toEqual({ type: 2, repeat_interval: 1, weekly_days: "2,3,4,5,6", end_times: 0 });
    expect(body?.topic).toBe("One Day at a Time - Hybrid Mon-Fri - In Person Sat");
  });

  it("names the family the same way when the caller passes only the other rows", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    const hybrid = hybridWeekdays();

    // A caller holding siblings rather than the whole family still gets the family's name --
    // the row being written is added to it, never counted twice.
    await updateZoomMeeting("zid-shared", hybrid, [remoteSaturday()]);

    expect(getCapturedBody()?.topic).toBe("One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat");
  });

  it("uses the in-flight row rather than its stored copy when the family already contains it", async () => {
    const { getCapturedBody } = mockFetchCapturingBody();
    // What the database still holds for the row being edited, as getLinkedFamily returns it.
    const storedHybrid = familyRow("m-hybrid", "Hybrid", ["Monday"]);
    const editedHybrid = hybridWeekdays();

    await updateZoomMeeting("zid-shared", editedHybrid, [storedHybrid, remoteSaturday()]);

    const body = getCapturedBody();
    expect(body?.recurrence).toEqual({ type: 2, repeat_interval: 1, weekly_days: "2,3,4,5,6,7", end_times: 0 });
    expect(body?.topic).toBe("One Day at a Time - Hybrid Mon-Fri - Zoom Only Sat");
  });
});
