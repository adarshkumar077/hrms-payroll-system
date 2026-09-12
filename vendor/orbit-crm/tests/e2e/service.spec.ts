import { test, expect } from "@playwright/test";
import { ceoAuthFile } from "./auth-paths";

// Service & AMC golden path (Wave C) — mirrors golden.spec.ts's rename-proof
// conventions: assert on stable markers (the "AMC-" numbering prefix, the
// .badge class, ₹-formatted amounts) rather than tenant-configurable module
// labels. Kept to a single minimal, non-flaky spec covering the contract
// create → list → inline-edit loop; cron automation is covered by
// lib/contracts-automation.test.ts + manual QA, not e2e.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

test.describe("CEO service contract golden path", () => {
  test.use({ storageState: ceoAuthFile });

  test("creates a contract, sees it in the list, then inline-edits its value", async ({ page }) => {
    const contractName = `QA E2E Contract ${Date.now()}`;

    const today = new Date();
    const start = new Date(today);
    start.setMonth(start.getMonth() - 6);
    const end = new Date(today);
    end.setMonth(end.getMonth() + 6);

    await page.goto("/contracts");

    await page.getByRole("button", { name: "+ New Contract" }).click();

    const form = page.locator("form", { has: page.locator('select[name="accountId"]') });
    await form.locator('input[name="name"]').fill(contractName);
    await form.locator('select[name="accountId"]').selectOption({ index: 1 });
    await form.locator('input[name="startDate"]').fill(isoDate(start));
    await form.locator('input[name="endDate"]').fill(isoDate(end));
    await form.locator('input[name="visitQuota"]').fill("0");

    await form.getByRole("button", { name: "Create contract" }).click();

    // Submit redirects straight to the new contract's detail page.
    await page.waitForURL(/\/contracts\/[^/]+$/, { timeout: 15_000 });
    const contractUrl = page.url();

    // Back on the list, the new contract shows up with an AMC- number and
    // an Active-category badge (the default contract_status option).
    await page.goto("/contracts");
    const row = page.locator("tr", { hasText: contractName });
    await expect(row).toBeVisible();
    await expect(row.getByText(/^AMC-/)).toBeVisible();
    await expect(row.locator("span.badge", { hasText: "Active" })).toBeVisible();

    // Open the detail page and inline-edit Value to 50000.
    await page.goto(contractUrl);
    const valueRow = page.locator("div.py-1\\.5").filter({ hasText: "Value (₹)" });
    await valueRow.getByRole("button").first().click();
    await valueRow.locator("input").fill("50000");
    await valueRow.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("₹50,000").first()).toBeVisible();
  });
});
