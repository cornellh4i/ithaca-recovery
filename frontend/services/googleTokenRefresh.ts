// No Prisma/Node-only imports here — this must stay callable from Edge middleware,
// not just from authConfig.ts's Node-runtime jwt callback.

const REFRESH_TIMEOUT_MS = 5000;

export type GoogleRefreshResult =
    | { ok: true; accessToken: string; expiresAt: number }
    | { ok: false; revoked: boolean };

export async function refreshGoogleAccessToken(
    refreshToken: string,
): Promise<GoogleRefreshResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            // Only invalid_grant means the grant itself is gone -- a 5xx, an invalid_client
            // misconfiguration, or a body that isn't even JSON is Google having a bad minute,
            // and telling an admin their authorization died over that costs a re-consent on nothing.
            let revoked = false;
            try {
                const body = await response.json();
                revoked = body?.error === "invalid_grant";
            } catch {
                revoked = false;
            }
            return { ok: false, revoked };
        }

        const refreshed = await response.json();
        return {
            ok: true,
            accessToken: refreshed.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
        };
    } catch {
        return { ok: false, revoked: false };
    } finally {
        clearTimeout(timeout);
    }
}
