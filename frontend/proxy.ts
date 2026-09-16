import { NextRequest, NextResponse } from "next/server";
import { getToken, encode } from "next-auth/jwt";
import { refreshGoogleAccessToken } from "./services/googleTokenRefresh";
import { getSecureCookie, getSessionCookieName } from "./lib/authCookies";

// https://github.com/vercel/next.js/issues/43704#issuecomment-1411186664

const REFRESH_SKEW_SECONDS = 60;
// Matches next-auth's own default session maxAge (authOptions sets no override).
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function proxy(request: NextRequest) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-url", request.url);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    const secureCookie = getSecureCookie();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, secureCookie });

    if (!token?.expiresAt || !token.refreshToken) return response;
    // A revoked grant can't heal without a re-consent, so the flag persisted below is also what
    // stops every later request re-asking Google a question whose answer already can't change.
    if (token.error) return response;
    if (Date.now() / 1000 <= token.expiresAt - REFRESH_SKEW_SECONDS) return response;

    // getServerSession()'s single-argument ("RSC") code path used elsewhere in this app
    // can't persist a refreshed token to the cookie — see services/auth.ts's getAuth().
    // Middleware has real cookie write access, so the refresh is persisted here instead.
    const refreshed = await refreshGoogleAccessToken(token.refreshToken);
    if (!refreshed.ok && !refreshed.revoked) return response; // transient — the next request retries

    const updatedToken = refreshed.ok
        ? { ...token, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt }
        : { ...token, error: "RefreshTokenError" as const };
    const newCookieValue = await encode({
        token: updatedToken,
        secret: process.env.NEXTAUTH_SECRET!,
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    response.cookies.set(getSessionCookieName(secureCookie), newCookieValue, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
        maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
}

export const config = {
    matcher: ["/((?!_next|favicon.ico|api/auth/).*)"],
};
