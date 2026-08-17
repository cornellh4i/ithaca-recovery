import type { getZoomHostCapacities as GetZoomHostCapacitiesFn } from "../../services/zoom";

// getZoomHostCapacities resolves each pooled host's Zoom license into a concurrent-meeting
// capacity (licensed = 2, basic = 1) behind a TTL cache. Exercised through mocked fetch, the
// same way zoom.test.ts/zoomTokenCache.test.ts cover the module's other network-backed paths.
let getZoomHostCapacities: typeof GetZoomHostCapacitiesFn;

const LICENSED = "licensed@icr.test";
const BASIC = "basic@icr.test";

const originalFetch = global.fetch;
const ENV_KEYS = ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_ACCOUNT_ID", "ZOOM_HOSTS"] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

// The module reads Date.now() for both cache expiry and token expiry; a stub makes TTL
// boundaries controllable without waiting on real time.
let now = Date.UTC(2026, 6, 1, 12, 0, 0);
let nowSpy: jest.SpyInstance<number, []>;
const advanceMinutes = (minutes: number) => {
  now += minutes * 60 * 1000;
};

beforeEach(async () => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.ZOOM_CLIENT_ID = "test-client-id";
  process.env.ZOOM_CLIENT_SECRET = "test-client-secret";
  process.env.ZOOM_ACCOUNT_ID = "test-account-id";
  // zoomHostPool is derived from this env var at module load, so it must be set before the
  // dynamic import below.
  process.env.ZOOM_HOSTS = `${LICENSED},${BASIC}`;

  now = Date.UTC(2026, 6, 1, 12, 0, 0);
  nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);

  // Module-level capacity and token caches -- fresh module instance per test.
  jest.resetModules();
  ({ getZoomHostCapacities } = await import("../../services/zoom"));
});

afterEach(() => {
  nowSpy.mockRestore();
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

// Serves a valid token, then a Zoom user record per host: `licensedTypes` maps an email to the
// Zoom `type` returned for it (2 = Licensed, 1 = Basic); an email mapped to null responds 404,
// standing in for an unresolvable host.
function mockZoomUsers(types: Record<string, number | null>) {
  const userFetches: string[] = [];
  const fetchMock = jest.fn((url: string) => {
    if (url.includes("oauth/token")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "tok-1", expires_in: 3600 }),
      });
    }
    const email = decodeURIComponent(url.split("/users/")[1]);
    userFetches.push(email);
    const type = types[email];
    if (type == null) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ type }) });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { userFetches, fetchMock };
}

describe("getZoomHostCapacities", () => {
  it("gives a licensed host capacity 2 and a basic host capacity 1", async () => {
    mockZoomUsers({ [LICENSED]: 2, [BASIC]: 1 });

    expect(await getZoomHostCapacities()).toEqual({ [LICENSED]: 2, [BASIC]: 1 });
  });

  it("fails safe to capacity 1 for a host whose license status can't be read", async () => {
    mockZoomUsers({ [LICENSED]: 2, [BASIC]: null });

    expect(await getZoomHostCapacities()).toEqual({ [LICENSED]: 2, [BASIC]: 1 });
  });

  it("fails safe to capacity 1 for every host when Zoom can't be reached at all", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;

    expect(await getZoomHostCapacities()).toEqual({ [LICENSED]: 1, [BASIC]: 1 });
  });

  it("serves later calls from the cache instead of re-asking Zoom", async () => {
    const { userFetches } = mockZoomUsers({ [LICENSED]: 2, [BASIC]: 1 });

    await getZoomHostCapacities();
    advanceMinutes(60);
    await getZoomHostCapacities();

    expect(userFetches).toEqual([LICENSED, BASIC]);
  });

  it("coalesces concurrent cache misses into one pool sweep", async () => {
    const { userFetches } = mockZoomUsers({ [LICENSED]: 2, [BASIC]: 1 });

    const [first, second] = await Promise.all([getZoomHostCapacities(), getZoomHostCapacities()]);

    expect(first).toEqual({ [LICENSED]: 2, [BASIC]: 1 });
    expect(second).toEqual(first);
    expect(userFetches).toEqual([LICENSED, BASIC]);
  });

  it("re-checks an all-unknown result within minutes rather than holding it for the full window", async () => {
    // One transient outage must not pin the whole pool to capacity 1 for 12 hours.
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    ) as unknown as typeof fetch;
    expect(await getZoomHostCapacities()).toEqual({ [LICENSED]: 1, [BASIC]: 1 });

    advanceMinutes(6);
    const { userFetches } = mockZoomUsers({ [LICENSED]: 2, [BASIC]: 2 });

    expect(await getZoomHostCapacities()).toEqual({ [LICENSED]: 2, [BASIC]: 2 });
    expect(userFetches).toEqual([LICENSED, BASIC]);
  });
});
