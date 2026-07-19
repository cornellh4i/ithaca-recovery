import { randomUUID } from "crypto";
import { Role, Admin } from "@prisma/client";
import { getTestPrismaClient } from "./db";

export async function seedAdmin(
  role: Role = Role.ADMIN,
  overrides: Partial<Admin> = {},
): Promise<Admin> {
  const prisma = getTestPrismaClient();
  return prisma.admin.create({
    data: {
      email: `admin-${randomUUID()}@test.icr`,
      name: "Test Admin",
      role,
      ...overrides,
    },
  });
}
