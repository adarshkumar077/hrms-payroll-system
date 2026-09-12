import { test, expect } from "@playwright/test";
import { ceoAuthFile, salesAuthFile } from "./auth-paths";

// Golden-path harness (WS0.5) — the safety net for future refactors.
//
// IMPORTANT: the demo tenant currently carries an AI-applied real-estate
// Studio config (nav labels say "Bookings"/"Clients" instead of
// "Opportunities"/"Accounts"). Every assertion below is written to be
// RENAME-PROOF: we assert on hrefs (which are the stable route registry in
// lib/nav.ts, never renamed by Studio) and on marker strings that don't come
// from tenant-configurable module labels (₹ amounts, "Needs your attention",
// "don't have access", aria-labels keyed by module id). Never assert on a
// module's display label (e.g. "Opportunities", "Leads" as a heading) here.
//
// CEO/Sales sessions are pre-authenticated by auth.setup.ts (see that file
// for why — the login form is real-rate-limited) and loaded here via
// `storageState`, so these tests never submit the login form themselves.

test.describe("Login page", () => {
  test("renders Orbit brand and demo creds hint", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Orbit", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    // Demo creds hint — stable regardless of tenant config.
    await expect(page.getByText("ceo@demo.orbit")).toBeVisible();
    await expect(page.getByText("sales@demo.orbit", { exact: false })).toBeVisible();
  });
});

test.describe("CEO golden path", () => {
  test.use({ storageState: ceoAuthFile });

  test("lands on /dashboard with attention feed and a rupee stat", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Needs your attention")).toBeVisible();
    // At least one ₹-formatted money stat is rendered on the cockpit.
    await expect(page.getByText("₹", { exact: false }).first()).toBeVisible();
  });

  test("/leads renders table and scorecard tiles", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.locator("table")).toBeVisible();
    // Scorecard tile hrefs carry ?status= — rename-proof (not the tile label).
    const statusTile = page.locator('a[href*="status="]').first();
    await expect(statusTile).toBeVisible();
  });

  test("/studio renders module configuration table", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.locator('input[aria-label="leads plural label"]')).toBeVisible();
  });

  test("sidebar links to /studio and /leads", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('aside a[href="/studio"]')).toBeVisible();
    await expect(page.locator('aside a[href="/leads"]')).toBeVisible();
  });

  test("logout returns to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Sales golden path (restricted role)", () => {
  test.use({ storageState: salesAuthFile });

  test("/dashboard shows the no-access message", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/don't have access/i)).toBeVisible();
  });

  test("sidebar has no /payroll link; direct /payroll shows No access", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('aside a[href="/payroll"]')).toHaveCount(0);
    await page.goto("/payroll");
    await expect(page.getByText(/no access/i)).toBeVisible();
  });
});
