import NextAuth, { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";
import type { Role } from "@prisma/client";

declare module "next-auth" {
    interface Session {
        accessToken?: string;
        user: {
            role?: Role;
        } & DefaultSession["user"];
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: number;
        role?: Role;
    }
}
