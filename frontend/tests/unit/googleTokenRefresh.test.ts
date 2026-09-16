import { refreshGoogleAccessToken } from "../../services/googleTokenRefresh";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

test("returns the refreshed access token and expiry on success", async () => {
  const before = Math.floor(Date.now() / 1000);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: "new-token", expires_in: 3600 }),
  }) as unknown as typeof fetch;

  const result = await refreshGoogleAccessToken("refresh-token");

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected a successful refresh");
  expect(result.accessToken).toBe("new-token");
  expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3600);
  expect(result.expiresAt).toBeLessThanOrEqual(before + 3601);
});

test("reports a revoked grant when Google answers invalid_grant", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ error: "invalid_grant", error_description: "Token has been expired or revoked." }),
  }) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: true });
});

// The distinction the whole reconnect prompt rests on: everything below is Google having a bad
// minute, and must never be reported as a dead authorization.
test("a 5xx is a failure but not a revocation", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ error: "backendError" }),
  }) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: false });
});

test("invalid_client (a misconfigured app, not a dead grant) is not a revocation", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: "invalid_client" }),
  }) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: false });
});

test("an error response whose body isn't JSON is not a revocation", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  }) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: false });
});

test("a network error is not a revocation", async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: false });
});

test("a timeout resolves as a failure rather than hanging, and is not a revocation", async () => {
  global.fetch = jest.fn().mockImplementation(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  ) as unknown as typeof fetch;

  jest.useFakeTimers();
  const promise = refreshGoogleAccessToken("refresh-token");
  jest.advanceTimersByTime(5000);

  await expect(promise).resolves.toEqual({ ok: false, revoked: false });
});

// A 200 that doesn't actually carry a token is the quietest way to break a session: a NaN
// expiresAt reads as falsy at every later expiry check, so the session simply stops refreshing
// and nothing ever reports why.
test("a 200 missing expires_in is a failure, not a usable token", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ access_token: "new-token" }),
  }) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: false });
});

test("a 200 missing access_token is a failure, not a usable token", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ expires_in: 3600 }),
  }) as unknown as typeof fetch;

  await expect(refreshGoogleAccessToken("refresh-token")).resolves.toEqual({ ok: false, revoked: false });
});
