import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "../../../lib/prisma";
import { refreshGoogleAccessToken } from "../../../services/googleTokenRefresh";

export const authOptions: NextAuthOptions = {
    pages: {
        signIn: "/login",
    },
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    access_type: "offline",
                    prompt: "consent",
                    scope: [
                        "openid",
                        "email",
                        "profile",
                        "https://www.googleapis.com/auth/calendar.events",
                    ].join(" "),
                },
            },
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            if (!user.email) return false;
            const admin = await prisma.admin.findUnique({ where: { email: user.email } });
            return !!admin;
        },
        async jwt({ token, account, profile }) {
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;

                if (token.email) {
                    // signIn already guarantees this row exists (invite or bootstrap) — update, don't create.
                    const existing = await prisma.admin.findUnique({
                        where: { email: token.email },
                        select: { name: true },
                    });

                    const updated = await prisma.admin.update({
                        where: { email: token.email },
                        data: {
                            name: existing?.name ? undefined : (token.name ?? (profile as { name?: string })?.name ?? undefined),
                            googleId: account.providerAccountId,
                            refreshToken: account.refresh_token ?? undefined,
                            tokenExpiresAt: account.expires_at ?? undefined,
                        },
                        select: { role: true },
                    });

                    token.role = updated.role;
                }
            }

            if (token.expiresAt && Date.now() / 1000 > token.expiresAt - 60) {
                const refreshed = await refreshGoogleAccessToken(token.refreshToken!);
                if (refreshed) {
                    token.accessToken = refreshed.accessToken;
                    token.expiresAt = refreshed.expiresAt;
                } else {
                    // Refresh token revoked (or the refresh call failed/timed out) — force re-login
                    return { ...token, error: "RefreshTokenError" };
                }
            }

            // Re-fetch on every call (not just login) so role changes/removal take effect
            // without waiting out the JWT's 30-day maxAge.
            if (!account && token.email) {
                const admin = await prisma.admin.findUnique({
                    where: { email: token.email },
                    select: { role: true },
                });
                token.role = admin?.role;
            }

            return token;
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken;
            if (session.user) session.user.role = token.role;
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};