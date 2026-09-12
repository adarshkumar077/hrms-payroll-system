import { test, expect } from "@playwright/test";
import { ceoAuthFile } from "./auth-paths";

// Quotation builder golden path (Wave B) — mirrors golden.spec.ts's
// rename-proof conventions: assert on stable markers (₹ amounts, the .badge
// class, table structure) rather than tenant-configurable module/stage
// labels. Kept to a single minimal, non-flaky spec — optional-line and
// convert-to-invoice flows are covered by manual QA, not e2e.

test.describe("CEO quotation builder", () => {
  test.use({ storageState: ceoAuthFile });

  test("creates a quotation with one line and shows the grand total + stage badge", async ({ page }) => {
    await page.goto("/quotations/new");

    // Pick any account (first real option after the disabled placeholder).
    const accountSelect = page.locator('select[name="accountId"]');
    await accountSelect.selectOption({ index: 1 });

    // Fill the one default line row: qty 2 x unitPrice 1000 @ 18% tax
    // (18% is LineGrid's default taxRate, so it's left untouched) ->
    // grand total = 2 * 1000 * 1.18 = 2,360.
    const row = page.locator("table tbody tr").first();
    await row.getByPlaceholder("Line description").fill("QA gate test line");
    const numberInputs = row.locator('input[type="number"]');
    await numberInputs.nth(0).fill("2"); // qty
    await numberInputs.nth(1).fill("1000"); // unit price

    // Live totals preview reflects the math before submit.
    await expect(page.getByText("₹2,360")).toBeVisible();

    await page.getByRole("button", { name: "Create quotation" }).click();

    // Submit redirects to the detail page.
    await page.waitForURL(/\/quotations\/[^/]+$/, { timeout: 15_000 });

    // Server-computed grand total matches the live preview.
    await expect(page.getByText("₹2,360").first()).toBeVisible();

    // A stage badge is rendered next to the quotation number.
    await expect(page.locator("span.badge").first()).toBeVisible();
  });
});
