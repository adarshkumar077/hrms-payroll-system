# Email OTP login: setup and verification

Employees sign in with their **registered mobile number**. The one-time code is sent to the **email
address HR has on file** for that employee, over your own SMTP server. No SMS provider is used, and
MSG91 has been removed from the code.

> **Status (27 Nov 2026): built and tested against a local mock SMTP server only.** No real email has
> been delivered yet because no SMTP credentials have been provided. Do not tell staff that OTP login
> works until the real-inbox test in step 4 passes.

## 1. How it works

| Step | What happens |
|---|---|
| Employee enters mobile | `POST /api/v1/auth/otp/request`. The answer is always the same generic message, whether or not the number exists, so the endpoint can't be used to find out who works here. |
| Eligibility | Only active **employee** accounts. Super Admin, Admin and HR must use User ID + password (+ 2FA). The employee must have a valid email on file; otherwise nothing is sent and a masked warning is logged. |
| Code | 6 random digits, valid **5 minutes**, single use, stored only as an HMAC-SHA256 hash keyed by `OTP_HASH_SECRET`. |
| Email | Branded HTML + plain-text email from `SMTP_FROM_NAME <SMTP_FROM_EMAIL>`, with the support contact and a "didn't request this?" note. |
| Verify | `POST /api/v1/auth/otp/verify`. Five wrong attempts lock that code. |

### Limits (abuse protection)

| Limit | Value |
|---|---|
| Resend cooldown | 30 seconds |
| Per mobile | 5 per hour, 10 per day |
| Per IP address | 30 per hour |
| Wrong codes per OTP | 5, then a new OTP is needed |
| Outgoing mail cap | `MAIL_MAX_PER_MINUTE` (default 60) |
| SMTP retries | up to 3 tries (0 s, 2 s, 5 s); no retry for authentication errors or permanent 5xx rejections |

### Logging and privacy

* The OTP code is **never** logged, stored in plain text, or returned by the API.
* Delivery is recorded on the OTP challenge (`sent` / `failed` + the provider message id). Logs show
  only a masked address such as `ra***@company.com`.
* Repeated delivery failures appear in **System health** and are emailed to `ALERT_EMAILS` (see
  `SERVER_CONFIGURATION.md`, Monitoring).

## 2. What you need to provide

1. An SMTP account that may send from your company domain. Examples: company mail server, Google
   Workspace (app password or SMTP relay), Microsoft 365 (SMTP AUTH enabled on the mailbox), Zoho
   Mail, Amazon SES, Brevo.
2. Host, port, username and password.
3. The From address (for example `hrms-noreply@yourcompany.com`) and a display name.
4. SPF / DKIM / DMARC records for that domain, set up by whoever manages your DNS. Without them, OTP
   emails will often land in spam.
5. One **real test employee mailbox** that you can open.

## 3. Configure

In `.env.production` on the server (permissions `600`, never committed):

```ini
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587            # 587 = STARTTLS (recommended); 465 = implicit TLS
SMTP_SECURE=false        # true only for port 465
SMTP_USER=hrms-noreply@yourcompany.com
SMTP_PASSWORD=********   # app password / SMTP key, not a personal password
SMTP_FROM_EMAIL=hrms-noreply@yourcompany.com
SMTP_FROM_NAME=EITF HRMS
SUPPORT_CONTACT=HR desk, hr@yourcompany.com, ext. 101
OTP_HASH_SECRET=<openssl rand -hex 32>
MAIL_MAX_PER_MINUTE=60
ALERT_EMAILS=it-admin@yourcompany.com
```

TLS 1.2 or newer is enforced, and on port 587 STARTTLS is mandatory. Only disable that
(`SMTP_REQUIRE_TLS=false`) for a mail relay on your internal network.

Apply the change: `docker compose --env-file .env.production up -d api`.

## 4. Verify (required before launch)

1. Sign in as **Super Admin** and open `GET /api/v1/admin/email/status`. It should show
   `configured: true`, and the connection check should succeed.
2. `POST /api/v1/admin/email/test` sends a test email to **your own** Super Admin address. The action
   is audit-logged.
3. Create or choose a test employee whose email is the real test mailbox (HR → Employees).
4. On the login page choose **Mobile OTP**, enter that employee's mobile number, and check that the
   email arrives in the inbox (not spam) within a minute.
5. Enter the code: you should be signed in as that employee.
6. Negative checks: a wrong code is rejected, the code is refused after 5 minutes, and the same code
   can't be used twice.
7. Record the result (date, provider, time to arrive, inbox or spam) in `TESTING_RESULTS.md`.

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Login page says email delivery is not configured | `SMTP_HOST` or a valid `SMTP_FROM_EMAIL` is missing; restart the API after editing |
| `EAUTH` in the API log | Wrong user/password, an app password is required, or SMTP AUTH is disabled for the mailbox (Microsoft 365) |
| Timeout | Outbound port 587/465 blocked by the ISP or firewall |
| Email in spam | SPF/DKIM/DMARC not set for the From domain |
| "Sent" but the employee got nothing | The wrong email is on file: HR must correct it (only HR/Admin can change an employee's email or mobile) |

## 6. Tests in the repository

* `apps/api/src/mail/mail.service.spec.ts`: transport settings, retry rules, masking.
* `apps/api/test/otp-login.e2e.mjs`: 54 end-to-end cases against a real API and a mock SMTP
  receiver (delivery, limits, lockout, single use, privileged roles refused, employee without email,
  no OTPs or full email addresses in the logs). Last run: **54/54 passed** (27 Nov 2026).
