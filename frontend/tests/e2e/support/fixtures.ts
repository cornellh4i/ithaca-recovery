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
  // Meetings pile up visually on the shared calendar view across a run this size —
  // same default room/time slots start overlapping and intercepting each other's
  // clicks. Admins pile up too, just logically rather than visually — tests that
  // assert "the sole SUPER_ADMIN" break once enough earlier tests' super admins are
  // still sitting in the table. No test relies on a prior test's seeded data
  // surviving, so it's cheaper and more reliable to clear both before each test than
  // to work around the collisions. This has to be a fixture (not a plain
  // `test.beforeEach` in this module) — that registers only against whichever spec
  // file happens to import this module first, since Node caches the module and its
  // top-level `test.beforeEach` call only runs once. `adminPage`/`superAdminPage`
  // declare it as a dependency so their own seeding always happens after cleanup,
  // not in whatever order Playwright would otherwise pick between independent
  // fixtures.
  cleanTestData: void;
};

export const test = base.extend<Fixtures>({
  // Browser console output otherwise goes nowhere in CI -- the app has real
  // console.error/console.log calls (e.g. DayView/WeekView's fetch error handling)
  // that are invisible without this.
  page: async ({ page }, use) => {
    // msg.text() stringifies objects/arrays as useless "[Object]"/"[Array]" -- pull the
    // actual serialized values from the console call's arguments instead.
    page.on("console", async (msg) => {
      const args = await Promise.all(msg.args().map((arg) => arg.jsonValue().catch(() => "<unserializable>")));
      console.log(`[browser:${msg.type()}]`, ...args);
    });
    page.on("pageerror", (err) => console.log(`[browser:pageerror] ${err.message}`));
    await use(page);
  },
  adminPage: async ({ page, context, cleanTestData: _cleanTestData }, use) => {
    const admin = await seedAdmin(Role.ADMIN);
    await loginAs(context, admin.email);
    await use({ page, admin });
  },
  superAdminPage: async ({ page, context, cleanTestData: _cleanTestData }, use) => {
    const admin = await seedAdmin(Role.SUPER_ADMIN);
    await loginAs(context, admin.email);
    await use({ page, admin });
  },
  cleanTestData: [
    async ({}, use) => {
      const prisma = getTestPrismaClient();
      await prisma.suspensionPeriod.deleteMany({});
      await prisma.recurrencePattern.deleteMany({});
      await prisma.meeting.deleteMany({});
      await prisma.admin.deleteMany({});
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
