import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    admin: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("../../services/googleTokenRefresh", () => ({
  refreshGoogleAccessToken: jest.fn(),
}));

import { prisma } from "../../lib/prisma";
import { refreshGoogleAccessToken } from "../../services/googleTokenRefresh";
import { authOptions } from "../../app/api/auth/authConfig";

const mockedFindUnique = prisma.admin.findUnique as unknown as jest.Mock;
const mockedUpdate = prisma.admin.update as unknown as jest.Mock;
const mockedRefresh = refreshGoogleAccessToken as unknown as jest.Mock;

const EXPIRED_AT = Math.floor(Date.now() / 1000) - 120;

// The callbacks are declared with next-auth's full parameter object; these tests only ever
// exercise the fields the callbacks actually read.
const runJwt = (params: { token: JWT; account?: Account | null; profile?: unknown }) =>
  authOptions.callbacks!.jwt!({
    user: undefined,
    account: null,
    ...params,
  } as never) as Promise<JWT>;

const runSession = (token: JWT) =>
  authOptions.callbacks!.session!({
    session: { user: { email: "admin@test.icr" }, expires: "2099-01-01T00:00:00.000Z" },
    token,
  } as never) as Promise<Session>;

beforeEach(() => {
  mockedFindUnique.mockReset().mockResolvedValue({ role: "ADMIN", name: "Existing Admin" });
  mockedUpdate.mockReset().mockResolvedValue({ role: "ADMIN" });
  mockedRefresh.mockReset();
});

describe("jwt callback", () => {
  it("flags the token when Google confirms the grant is revoked", async () => {
    mockedRefresh.mockResolvedValue({ ok: false, revoked: true });

    const token = await runJwt({
      token: { email: "admin@test.icr", refreshToken: "r-1", expiresAt: EXPIRED_AT },
    });

    expect(token.error).toBe("RefreshTokenError");
  });

  it("leaves the token alone when the refresh fails transiently", async () => {
    mockedRefresh.mockResolvedValue({ ok: false, revoked: false });

    const token = await runJwt({
      token: { email: "admin@test.icr", refreshToken: "r-1", expiresAt: EXPIRED_AT, accessToken: "a-1" },
    });

    expect(token.error).toBeUndefined();
    expect(token.accessToken).toBe("a-1");
    expect(token.expiresAt).toBe(EXPIRED_AT);
  });

  it("adopts the new access token and expiry on a successful refresh", async () => {
    mockedRefresh.mockResolvedValue({ ok: true, accessToken: "a-2", expiresAt: EXPIRED_AT + 3600 });

    const token = await runJwt({
      token: { email: "admin@test.icr", refreshToken: "r-1", expiresAt: EXPIRED_AT, accessToken: "a-1" },
    });

    expect(token.accessToken).toBe("a-2");
    expect(token.expiresAt).toBe(EXPIRED_AT + 3600);
    expect(token.error).toBeUndefined();
  });

  it("skips the refresh entirely once the error is already set", async () => {
    const token = await runJwt({
      token: { email: "admin@test.icr", refreshToken: "r-1", expiresAt: EXPIRED_AT, error: "RefreshTokenError" },
    });

    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(token.error).toBe("RefreshTokenError");
  });

  it("clears the error when a fresh account arrives (re-consent)", async () => {
    const token = await runJwt({
      token: { email: "admin@test.icr", error: "RefreshTokenError" },
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "g-1",
        access_token: "a-new",
        refresh_token: "r-new",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      } as Account,
    });

    expect(token.error).toBeUndefined();
    expect(token.accessToken).toBe("a-new");
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  // Regression: the revoked path used to early-return, so a session holding a dead Google token
  // also stopped noticing role changes/removal until its 30-day JWT aged out.
  it("still re-reads the role from the database on the revoked path", async () => {
    mockedRefresh.mockResolvedValue({ ok: false, revoked: true });
    mockedFindUnique.mockResolvedValue({ role: "SUPER_ADMIN" });

    const token = await runJwt({
      token: { email: "admin@test.icr", refreshToken: "r-1", expiresAt: EXPIRED_AT, role: "ADMIN" },
    });

    expect(mockedFindUnique).toHaveBeenCalledWith({
      where: { email: "admin@test.icr" },
      select: { role: true },
    });
    expect(token.role).toBe("SUPER_ADMIN");
    expect(token.error).toBe("RefreshTokenError");
  });
});

describe("session callback", () => {
  it("derives googleAuthExpired from the token's error", async () => {
    const expired = await runSession({ email: "admin@test.icr", error: "RefreshTokenError" });
    expect(expired.googleAuthExpired).toBe(true);

    const healthy = await runSession({ email: "admin@test.icr", accessToken: "a-1" });
    expect(healthy.googleAuthExpired).toBe(false);
  });

  it("still exposes the access token when the authorization is expired", async () => {
    const session = await runSession({ accessToken: "a-1", error: "RefreshTokenError" });
    expect(session.accessToken).toBe("a-1");
  });
});
