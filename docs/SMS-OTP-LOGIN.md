# Mobile Number + OTP Login

Employees can sign in with their registered mobile number and a 6-digit OTP sent by SMS.
Super Admin, Admin and HR accounts keep User ID / email + password (+ 2FA) and cannot use OTP.

## How it works

| Step | Behaviour |
|---|---|
| Who can use it | Accounts with the **EMPLOYEE** role only, status Active (or pending password change), linked to an **active** employee record whose employment status is not Inactive / Terminated / Resigned. Any account that also has Super Admin / Admin / HR is refused. A timed lockout that has already expired is lifted at login, exactly as with password login; a running lockout or an HR lock blocks OTP. |
| Number lookup | Numbers match on their last 10 digits in whatever format they were saved (`+91`, `91`, `0`, spaces, dashes). The **employee record's mobile is authoritative**: the login account's own mobile only counts when the employee record has none, so when HR changes an employee's number the old number stops working at once. A number that maps to more than one account is refused (HR must fix the duplicate). |
| OTP | 6 digits from `crypto.randomInt`, valid **5 minutes**, **single use**. A new OTP cancels the previous one. |
| Storage | Only an HMAC-SHA256 hash (key `OTP_HASH_SECRET`, bound to the challenge id) is stored in `otp_challenges`. The code is never stored, logged or returned by the API. |
| Wrong codes | 5 incorrect attempts cancel the OTP; the user must request a new one. |
| Resend | 30-second cooldown per number. |
| Rate limits | Per number: 5 per hour, 10 per day. Per IP: 5 per minute and 30 per hour. |
| Privacy | Every number gets the same response and the same limits, so the API does not reveal which numbers are registered. Verification messages are specific — "Incorrect OTP. N attempts remaining.", "This OTP has expired. Please request a new OTP.", "Too many incorrect attempts…", "No active OTP for this number…" — and identical for registered and unregistered numbers. |
| Login page | Two tabs: **Password Login** and **Mobile OTP Login** (responsive down to phone width). After sending: "OTP sent to +91 ******1234" with a live expiry countdown and a 30-second resend countdown. If SMS is not configured, the OTP tab shows "SMS provider not configured" with the reason and the Send button is disabled; it never claims an OTP was sent. |
| Accounts | OTP never creates or changes an account or employee record. |
| Audit | Successful OTP logins are recorded as `LOGIN` with metadata `{ "method": "mobile_otp" }` (password logins are unchanged); failed OTP attempts for a real account are recorded as `LOGIN_FAILED` (method `mobile_otp`). Logs show only the last 4 digits of a number. |
| Retention | OTP rows (mobile number, IP, hash) are deleted after 7 days by a daily job at 03:30 IST. |
| 2FA | If an employee has enabled authenticator 2FA, they must enter that code together with the OTP. A correct OTP is used up even when the 2FA code is wrong or missing, so they request a new OTP (after the 30-second cooldown). |

API endpoints (all public, under `/api/v1`):

- `GET  /auth/otp/status` → `{ enabled, codeLength, expiresInSeconds, resendAfterSeconds }`
- `POST /auth/otp/request` `{ mobile }` → generic message; `429` while cooling down or rate-limited; `503` if SMS is not configured
- `POST /auth/otp/verify` `{ mobile, code, totpCode? }` → session (same shape as password login)

## SMS provider: MSG91

Indian law (TRAI) requires every OTP SMS to use a **DLT-registered sender ID and template**.

What you need:

1. An MSG91 account (https://msg91.com) with credits.
2. DLT registration of your company (Principal Entity) on an operator DLT portal (Jio, Airtel, Vi, BSNL…), plus an approved **sender ID** (header) and an approved **OTP content template**, for example:
   `Your EITF HRMS login OTP is ##otp##. It is valid for 5 minutes. Do not share it with anyone.`
3. In MSG91, create a **Flow / SMS template** linked to that DLT template, with a variable named `otp` (or set `MSG91_OTP_VAR`).

Environment variables (API; never commit real values):

| Variable | Required | Value |
|---|---|---|
| `SMS_PROVIDER` | yes | `msg91` (empty = OTP login off) |
| `MSG91_AUTH_KEY` | yes | MSG91 auth key (secret) |
| `MSG91_OTP_TEMPLATE_ID` | yes | MSG91 flow/template id |
| `MSG91_OTP_VAR` | no | Template variable name for the code (default `otp`) |
| `OTP_HASH_SECRET` | strongly recommended | `openssl rand -base64 48`. If empty, a separate key is derived from `JWT_ACCESS_SECRET`. Changing it invalidates OTPs that are in flight (harmless). |

Local development: put them in `apps/api/.env`. Docker / server: `.env.production` (forwarded by `docker-compose.yml`). Restart the API after changing them. `GET /api/v1/auth/otp/status` then returns `"enabled": true`.

There is deliberately **no console / fake SMS mode** and no fixed test code: without a configured provider, the login screen shows "Mobile OTP login is not available yet" and employees use User ID + password.

## Prerequisite data

An employee can use OTP only if HR has saved their 10-digit mobile number on the employee record and the employee has a login account. Each number must belong to one account only.

## Tests

- Unit: `npx tsx --test src/auth/otp/mobile.util.spec.ts src/sms/msg91.provider.spec.ts src/auth/otp-dev-echo.spec.ts`
- End-to-end (from `apps/api`, embedded Postgres running, after `npm run build`): `node --test --test-concurrency=1 test/otp-login.e2e.mjs`.
  It recreates a separate `eitf_hrms_test` database (the development database is not touched), starts the compiled API on port 3101 and a local mock of the MSG91 HTTP API, and covers: delivery, correct / wrong / expired / reused OTPs, concurrent reuse, attempt limits, resend cooldown, per-number and per-IP limits, inactive / unlinked / duplicate / admin accounts, unchanged password logins, employee data isolation, and that no OTP or SMS key reaches the logs.

## Not yet covered

- The Expo mobile app (`apps/mobile`) still uses password login.
- A real SMS has not been sent: that needs your MSG91 credentials and DLT template.
- An employee whose account still requires a first password change is sent to the change-password page after OTP login, which asks for the current (temporary) password HR gave them.
