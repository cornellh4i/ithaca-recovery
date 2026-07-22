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

  expect(result).not.toBeNull();
  expect(result!.accessToken).toBe("new-token");
  expect(result!.expiresAt).toBeGreaterThanOrEqual(before + 3600);
  expect(result!.expiresAt).toBeLessThanOrEqual(before + 3601);
});

test("returns null when Google responds with a non-ok status (revoked token)", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

  const result = await refreshGoogleAccessToken("refresh-token");

  expect(result).toBeNull();
});

test("returns null instead of hanging when the request times out", async () => {
  global.fetch = jest.fn().mockImplementation(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  ) as unknown as typeof fetch;

  jest.useFakeTimers();
  const promise = refreshGoogleAccessToken("refresh-token");
  jest.advanceTimersByTime(5000);

  await expect(promise).resolves.toBeNull();
});
