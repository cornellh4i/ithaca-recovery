import { PrismaClient } from "@prisma/client";

// Shared across all factories/tests in a given process — points at whatever
// DATABASE_URL is set to (the in-memory replica set for e2e/integration runs).
let client: PrismaClient | null = null;

export function getTestPrismaClient(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export async function disconnectTestPrismaClient(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
