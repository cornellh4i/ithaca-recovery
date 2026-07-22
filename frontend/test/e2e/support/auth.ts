import { encode } from "next-auth/jwt";
import type { BrowserContext } from "@playwright/test";
import { TEST_NEXTAUTH_SECRET } from "./testConstants";

// Mints a NextAuth v4 JWT-strategy session token for the given email, with no
// `salt` (matches the app's config, which sets none — see authConfig.ts) and
// no accessToken/expiresAt (see sync-fixtures.ts for why that's the deliberate
// default: it skips the token-refresh network call and the GCal sync branch).
export async function mintSessionToken(
  email: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  return encode({
    token: { email, sub: email, name: "Test User", ...overrides },
    secret: TEST_NEXTAUTH_SECRET,
  });
}

// Injects a session cookie into the given browser context so the app treats
// the request as signed in as `email` — no real Google OAuth flow needed.
// `email` must match a seeded Admin row for requireRole()/page guards to pass;
// role itself comes from that row, not from anything baked into this cookie
// (authConfig.ts's jwt callback re-reads role from the DB on every request).
export async function loginAs(
  context: BrowserContext,
  email: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const value = await mintSessionToken(email, overrides);
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}
