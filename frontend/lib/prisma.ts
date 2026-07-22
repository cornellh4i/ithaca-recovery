import { PrismaClient } from "@prisma/client";

// Avoids exhausting the connection pool from repeated `new PrismaClient()` calls
// per route, and from Next.js dev-mode hot reload creating a new client each time.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
