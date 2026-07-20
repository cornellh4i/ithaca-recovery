import { LeaseSettings, Prisma } from "@prisma/client";
import { getTestPrismaClient } from "./db";

export async function seedLeaseSettings(overrides: Partial<LeaseSettings> = {}): Promise<LeaseSettings> {
  const prisma = getTestPrismaClient();
  const currentYear = new Date().getFullYear();
  return prisma.leaseSettings.create({
    data: {
      leaseStartDate: new Date(Date.UTC(currentYear, 6, 1)),
      leaseEndDate: new Date(Date.UTC(currentYear + 1, 5, 30)),
      rooms: [{ room: "Serenity Room", rate: 15, unit: "hr" }],
      agentFirstName: "Rental",
      agentLastName: "Agent",
      agentTitle: "Rental Agent",
      agentEmail: "rentals@test.icr",
      agentPhone: "(555) 555-5555",
      agentStreetAddress: "123 Test St",
      agentCity: "Ithaca",
      agentState: "NY",
      agentZip: "14850",
      emailTemplate: "Hello {group}",
      ...overrides,
      // `overrides` is typed via the Prisma model (LeaseSettings), where `rooms`
      // is the nullable read-side JsonValue; `create()` expects the write-side
      // InputJsonValue (no bare null). Same cast used in update/lease-settings/route.ts.
    } as unknown as Prisma.LeaseSettingsCreateInput,
  });
}
