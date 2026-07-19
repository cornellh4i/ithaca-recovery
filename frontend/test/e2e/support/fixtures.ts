import { test as base, type Page } from "@playwright/test";
import { Role, type Admin } from "@prisma/client";
import { seedAdmin } from "../../factories/admin";
import { loginAs } from "./auth";
import { getTestPrismaClient } from "../../factories/db";

type Fixtures = {
  // Signed in as a freshly-seeded ADMIN.
  adminPage: { page: Page; admin: Admin };
  // Signed in as a freshly-seeded SUPER_ADMIN.
  superAdminPage: { page: Page; admin: Admin };
  // Meetings (unlike Admins) pile up visually on the shared calendar view across a
  // run this size — same default room/time slots start overlapping and intercepting
  // each other's clicks. Meeting-related tests don't rely on prior tests' meetings
  // surviving, so it's cheaper and more reliable to clear them before each test than
  // to keep every meeting on distinct rooms/times forever. This has to be a fixture
  // (not a plain `test.beforeEach` in this module) — that registers only against
  // whichever spec file happens to import this module first, since Node caches the
  // module and its top-level `test.beforeEach` call only runs once.
  cleanMeetings: void;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ page, context }, use) => {
    const admin = await seedAdmin(Role.ADMIN);
    await loginAs(context, admin.email);
    await use({ page, admin });
  },
  superAdminPage: async ({ page, context }, use) => {
    const admin = await seedAdmin(Role.SUPER_ADMIN);
    await loginAs(context, admin.email);
    await use({ page, admin });
  },
  cleanMeetings: [
    async ({}, use) => {
      const prisma = getTestPrismaClient();
      await prisma.recurrencePattern.deleteMany({});
      await prisma.meeting.deleteMany({});
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
