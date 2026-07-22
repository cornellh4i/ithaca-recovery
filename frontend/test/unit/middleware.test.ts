import { NextRequest } from "next/server";
import { encode, decode } from "next-auth/jwt";

const TEST_SECRET = "middleware-test-secret-not-a-real-secret";
process.env.NEXTAUTH_SECRET = TEST_SECRET;

jest.mock("../../services/googleTokenRefresh");
import { refreshGoogleAccessToken } from "../../services/googleTokenRefresh";
const mockedRefresh = refreshGoogleAccessToken as jest.Mock;

// Imported after NEXTAUTH_SECRET is set and the refresh mock is installed, since
// middleware.ts reads process.env.NEXTAUTH_SECRET at call time, not import time.
import { middleware, config } from "../../middleware";

const COOKIE_NAME = "next-auth.session-token";

async function requestWithToken(overrides: Record<string, unknown> = {}): Promise<NextRequest> {
  const value = await encode({ token: { email: "admin@test.icr", sub: "admin@test.icr", ...overrides }, secret: TEST_SECRET });
  return new NextRequest("http://localhost:3000/api/retrieve/meeting", {
    headers: { cookie: `${COOKIE_NAME}=${value}` },
  });
}

beforeEach(() => {
  mockedRefresh.mockReset();
});

test("matcher excludes NextAuth's own handler but not the rest of /api", () => {
  const [pattern] = config.matcher;
  expect(pattern).toContain("api/auth/");
  const regex = new RegExp(`^${pattern.replace(/^\//, "").replace(/\/$/, "")}$`);
  expect(regex.test("api/auth/session")).toBe(false);
  expect(regex.test("api/retrieve/meeting")).toBe(true);
});

test("an unauthenticated request passes through with no Set-Cookie", async () => {
  const request = new NextRequest("http://localhost:3000/api/retrieve/meeting");

  const response = await middleware(request);

  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mockedRefresh).not.toHaveBeenCalled();
});

test("a token with no expiresAt/refreshToken (e.g. an e2e-minted test session) is left alone", async () => {
  const request = await requestWithToken();

  const response = await middleware(request);

  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mockedRefresh).not.toHaveBeenCalled();
});

test("a token that isn't near expiry passes through unchanged", async () => {
  const farFuture = Math.floor(Date.now() / 1000) + 3600;
  const request = await requestWithToken({ expiresAt: farFuture, refreshToken: "refresh-1" });

  const response = await middleware(request);

  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mockedRefresh).not.toHaveBeenCalled();
});

test("a token within the refresh skew gets refreshed and persisted via Set-Cookie", async () => {
  const almostExpired = Math.floor(Date.now() / 1000) + 30;
  mockedRefresh.mockResolvedValue({ accessToken: "brand-new-token", expiresAt: almostExpired + 3600 });
  const request = await requestWithToken({ expiresAt: almostExpired, refreshToken: "refresh-1", accessToken: "old-token" });

  const response = await middleware(request);

  expect(mockedRefresh).toHaveBeenCalledWith("refresh-1");
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).not.toBeNull();

  const [, cookieValue] = setCookie!.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))!;
  const decoded = await decode({ token: cookieValue, secret: TEST_SECRET });
  expect(decoded?.accessToken).toBe("brand-new-token");
  expect(decoded?.expiresAt).toBe(almostExpired + 3600);
});

test("a failed refresh (revoked token) leaves the cookie untouched", async () => {
  const almostExpired = Math.floor(Date.now() / 1000) + 30;
  mockedRefresh.mockResolvedValue(null);
  const request = await requestWithToken({ expiresAt: almostExpired, refreshToken: "refresh-1" });

  const response = await middleware(request);

  expect(response.headers.get("set-cookie")).toBeNull();
});
