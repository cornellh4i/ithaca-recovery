import "server-only";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
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
        async jwt({ token, account }) {
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;

                if (account.refresh_token && token.email) {
                    await prisma.admin.updateMany({
                        where: { email: token.email },
                        data: { refreshToken: account.refresh_token },
                    });
                }
            }
            
            if (token.expiresAt && Date.now() / 1000 > token.expiresAt - 60) {
                const response = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: process.env.GOOGLE_CLIENT_ID!,
                        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                        refresh_token: token.refreshToken!,
                        grant_type: "refresh_token",
                    }),
                });
            
                if (response.ok) {
                    const refreshed = await response.json();
                    token.accessToken = refreshed.access_token;
                    token.expiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in;
                } else {
                    // Refresh token revoked — force re-login
                    return { ...token, error: "RefreshTokenError" };
                }
            }
            return token;
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken;
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};