import type {
  checkZoomReachable as CheckZoomReachableFn,
  getZoomMeetingInvitation as GetZoomMeetingInvitationFn,
} from "../../services/zoom";

// The token cache in services/zoom.ts is module-level state, not per-call -- it persists across
// tests that share the same module instance. jest.resetModules() + a fresh dynamic import per
// test gives each test its own empty cache, the same way googleCalendar.test.ts resets that
// module's env-derived state.
let checkZoomReachable: typeof CheckZoomReachableFn;
let getZoomMeetingInvitation: typeof GetZoomMeetingInvitationFn;

const originalFetch = global.fetch;
const ENV_KEYS = ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_ACCOUNT_ID"] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(async () => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.ZOOM_CLIENT_ID = "test-client-id";
  process.env.ZOOM_CLIENT_SECRET = "test-client-secret";
  process.env.ZOOM_ACCOUNT_ID = "test-account-id";

  jest.resetModules();
  ({ checkZoomReachable, getZoomMeetingInvitation } = await import("../../services/zoom"));
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

// Mocks fetch to distinguish Zoom's token endpoint from any other Zoom API call by URL, so
// assertions can track how many times each was actually hit.
function mockFetch(opts: { invitationStatus?: number } = {}) {
  let tokenFetchCount = 0;
  let invitationFetchCount = 0;
  const fetchMock = jest.fn((url: string) => {
    if (url.includes("oauth/token")) {
      tokenFetchCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({ access_token: `tok-${tokenFetchCount}`, expires_in: 3600 }),
      });
    }
    invitationFetchCount++;
    const status = opts.invitationStatus ?? 200;
    return Promise.resolve({
      ok: status < 400,
      status,
      json: async () => ({ invitation: "Join info" }),
      text: async () => "error",
    });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { tokenFetchCount: () => tokenFetchCount, invitationFetchCount: () => invitationFetchCount };
}

test("a second Zoom API call within the cache window reuses the cached token instead of re-fetching", async () => {
  const { tokenFetchCount, invitationFetchCount } = mockFetch();

  await getZoomMeetingInvitation("zid-1");
  await getZoomMeetingInvitation("zid-1");

  expect(tokenFetchCount()).toBe(1);
  expect(invitationFetchCount()).toBe(2);
});

test("checkZoomReachable always forces a fresh token fetch, bypassing the cache", async () => {
  const { tokenFetchCount } = mockFetch();

  await getZoomMeetingInvitation("zid-1"); // primes the cache
  expect(tokenFetchCount()).toBe(1);

  await checkZoomReachable();
  expect(tokenFetchCount()).toBe(2);
});

test("a 401 from a Zoom API call evicts the cached token so the next call re-fetches", async () => {
  const { tokenFetchCount } = mockFetch({ invitationStatus: 401 });

  await getZoomMeetingInvitation("zid-1"); // token fetch #1; the invitation call itself gets a 401
  expect(tokenFetchCount()).toBe(1);

  await getZoomMeetingInvitation("zid-1"); // cache was evicted by the 401 above
  expect(tokenFetchCount()).toBe(2);
});
