# Golden-path E2E harness (Playwright)

The safety net for future refactors (WS0.5 from the CTO build plan). A small,
fast suite that exercises the real app through a real browser — login, RBAC
gating, and the pages most likely to break silently during a refactor.

## Files

- `auth-paths.ts` — shared constants (not a test file; imported by both
  `auth.setup.ts` and `golden.spec.ts` — Playwright forbids one test file
  importing another).
- `auth.setup.ts` — the `setup` project. Logs in once as CEO and once as
  Sales via the real `/login` form, then saves each session's cookie to
  `tests/e2e/.auth/{ceo,sales}.json` (gitignored) via `storageState`.
- `golden.spec.ts` — the `chromium` project (`dependencies: ["setup"]`).
  8 tests, split into three `describe` blocks:
  1. **Login page** (unauthenticated) — Orbit brand + demo creds hint render.
  2. **CEO golden path** (`storageState: ceoAuthFile`) — dashboard loads with
     the attention feed and a ₹ stat, `/leads` renders its table + a
     `?status=` scorecard tile, `/studio` renders the module table, the
     sidebar links to `/studio` and `/leads`, and sign-out returns to
     `/login`.
  3. **Sales golden path** (`storageState: salesAuthFile`, restricted role) —
     `/dashboard` shows the no-access message (Sales has no `dashboard`
     grant), the sidebar has no `/payroll` link, and a direct hit on
     `/payroll` shows "No access".

## Why `storageState` instead of logging in per test

`/login`'s server action is rate-limited (`lib/ratelimit.ts`: 10 attempts /
5 min, keyed per-process since there's no `x-forwarded-for` on localhost —
the bucket lives in the dev server's memory and persists across repeated
`playwright test` runs, not just within one run). An earlier version of this
suite logged in via the form in every test's `beforeEach` (7 logins per run)
and reliably tripped the real rate limiter on a second consecutive run,
turning "run the suite twice" into a flake. Logging in once per role in the
`setup` project keeps every re-run/retry at a flat 2 logins, independent of
how many spec tests exist.

## Rename-proofing

The demo tenant currently carries an AI-applied real-estate Studio config
(nav shows "Bookings"/"Clients" instead of "Opportunities"/"Accounts" —
see `docs/ai/STATE.md`, WS8). Every assertion here is written to survive
that: hrefs (`/leads`, `/studio`, `/payroll`, `?status=`), aria-labels keyed
by module id (`"leads plural label"`), and marker strings that aren't
tenant-configurable module labels (`"Needs your attention"`,
`"don't have access"`, `"No access"`, `₹`). Never assert on a module's
display label (e.g. a heading that says "Opportunities") in this suite —
Studio can rename it out from under you.

## Running locally

```bash
npm run e2e:install   # once — installs the Chromium browser binary
npm run e2e           # runs the suite (playwright.config.ts webServer
                       # reuses an already-running `npm run dev` on :3000,
                       # or starts one itself)
```

## CI

`.github/workflows/ci.yml` runs this in a separate `e2e` job (after
`build-and-test`) against a throwaway SQLite file
(`DATABASE_URL=file:./e2e-ci.db`, seeded fresh via `npm run db:seed`) so it
never touches a real dev database.
