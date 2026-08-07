import { seedAdmin } from "../factories/admin";
import { seedMeeting } from "../factories/meeting";
import { getTestPrismaClient, disconnectTestPrismaClient } from "../factories/db";
import { Role } from "@prisma/client";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

test("seed factories write to and read back from the embedded Postgres server", async () => {
  const admin = await seedAdmin(Role.SUPER_ADMIN);
  const meeting = await seedMeeting({ title: "Integration Smoke Meeting" });

  const prisma = getTestPrismaClient();
  const foundAdmin = await prisma.admin.findUnique({ where: { email: admin.email } });
  const foundMeeting = await prisma.meeting.findUnique({ where: { mid: meeting.mid } });

  expect(foundAdmin?.role).toBe(Role.SUPER_ADMIN);
  expect(foundMeeting?.title).toBe("Integration Smoke Meeting");
});
