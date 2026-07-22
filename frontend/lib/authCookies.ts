// next-auth's own cookie-name derivation (core/lib/cookie.js) isn't part of its
// public package exports, so this mirrors it locally. Must stay in sync with
// next-auth's own formula, which getToken()/next-auth's handler use internally.
export function getSecureCookie(): boolean {
    return !!process.env.VERCEL || (process.env.NEXTAUTH_URL?.startsWith("https://") ?? false);
}

export function getSessionCookieName(secureCookie: boolean): string {
    return `${secureCookie ? "__Secure-" : ""}next-auth.session-token`;
}
