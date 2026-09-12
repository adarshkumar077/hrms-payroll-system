import { test as setup } from "@playwright/test";
import { ceoAuthFile, salesAuthFile } from "./auth-paths";

// Auth setup project — logs in once per role and persists the session cookie
// to disk so golden.spec.ts tests reuse it via `storageState` instead of
// re-submitting the login form. This matters: /login's server action is
// rate-limited (lib/ratelimit.ts, 10 attempts / 5 min per process — the dev
// server keeps that in-memory bucket alive across repeated `playwright test`
// runs). Logging in once per role here, instead of once per test, keeps the
// suite far under that budget even across retries/re-runs.

const CEO = { email: "ceo@demo.orbit", password: "orbit123" };
const SALES = { email: "sales@demo.orbit", password: "orbit123" };

setup("authenticate as CEO", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', CEO.email);
  await page.fill('input[name="password"]', CEO.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await page.context().storageState({ path: ceoAuthFile });
});

setup("authenticate as Sales", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', SALES.email);
  await page.fill('input[name="password"]', SALES.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await page.context().storageState({ path: salesAuthFile });
});
