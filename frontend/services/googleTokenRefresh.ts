// No Prisma/Node-only imports here — this must stay callable from Edge middleware,
// not just from authConfig.ts's Node-runtime jwt callback.

const REFRESH_TIMEOUT_MS = 5000;

export async function refreshGoogleAccessToken(
    refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number } | null> {
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

        if (!response.ok) return null;

        const refreshed = await response.json();
        return {
            accessToken: refreshed.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}
