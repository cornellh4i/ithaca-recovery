import { test, expect } from "./support/fixtures";
import type { Page } from "@playwright/test";
import { seedMeeting } from "../factories/meeting";

// Dark mode (GitHub #456): theme toggle, persistence, pre-paint stamping, and System mode.
// Page grounds come from styles/theme.scss's --bg token.
const LIGHT_BG = "rgb(255, 255, 255)";
const DARK_BG = "rgb(23, 24, 28)";

const htmlTheme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const pageBg = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

test.describe("dark mode", () => {
  test("21.1 the navbar toggle cycles Light -> Dark -> System and persists across reload, signed out", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toHaveAttribute("data-theme-preference", "system");

    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-preference", "light");
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-preference", "dark");
    expect(await htmlTheme(page)).toBe("dark");
    expect(await pageBg(page)).toBe(DARK_BG);

    await page.reload();
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme-preference", "dark");
    expect(await htmlTheme(page)).toBe("dark");
    expect(await pageBg(page)).toBe(DARK_BG);

    await page.getByTestId("theme-toggle").click();
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme-preference", "system");
    expect(await htmlTheme(page)).toBeNull();
    expect(await pageBg(page)).toBe(LIGHT_BG); // System, with the OS emulated light
  });

  test("21.2 a stored dark preference is applied before any app JavaScript runs (no flash)", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("icr-theme", "dark"));
    // With every Next.js chunk blocked React never hydrates, so the only thing that can stamp
    // data-theme is the inline <head> script -- i.e. it happens during HTML parsing, pre-paint.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    expect(await htmlTheme(page)).toBe("dark");
    expect(await pageBg(page)).toBe(DARK_BG);
  });

  test("21.3 System mode follows the OS color scheme, including live changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme-preference", "system");
    expect(await htmlTheme(page)).toBeNull();
    expect(await pageBg(page)).toBe(DARK_BG);

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => pageBg(page)).toBe(LIGHT_BG);

    // An explicit choice overrides the OS.
    await page.getByTestId("theme-toggle").click(); // System -> Light
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await pageBg(page)).toBe(LIGHT_BG);
  });

  test("21.4 the mobile sidebar's Theme row selects any mode directly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();

    const group = page.getByRole("radiogroup", { name: "Theme" });
    await expect(group.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    await group.getByRole("radio", { name: "Dark" }).click();
    await expect(group.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(await htmlTheme(page)).toBe("dark");

    await page.reload();
    expect(await htmlTheme(page)).toBe("dark");
  });

  test("21.5 dark smoke pass: calendar and admin render on the dark ground without errors", async ({ superAdminPage }) => {
    const { page } = superAdminPage;
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.addInitScript(() => localStorage.setItem("icr-theme", "dark"));
    await seedMeeting({ title: "Dark Smoke Meeting" });

    await page.goto("/");
    await expect(page.getByText("Dark Smoke Meeting")).toBeVisible();
    expect(await pageBg(page)).toBe(DARK_BG);

    for (const tab of ["diagnostics", "signage", "users", "backups", "export"]) {
      await page.goto(`/admin/${tab}`);
      await expect(page.getByTestId(`admin-tab-${tab}`)).toBeVisible();
      expect(await htmlTheme(page)).toBe("dark");
    }
    expect(errors).toEqual([]);
  });
});
