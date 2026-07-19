import { test as base, type Page } from "@playwright/test";
import { Role, type Admin } from "@prisma/client";
import { seedAdmin } from "../../factories/admin";
import { loginAs } from "./auth";

type Fixtures = {
  // Signed in as a freshly-seeded ADMIN.
  adminPage: { page: Page; admin: Admin };
  // Signed in as a freshly-seeded SUPER_ADMIN.
  superAdminPage: { page: Page; admin: Admin };
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
});

export { expect } from "@playwright/test";
