# Super Admin access guide

## Status

The **production** Super Admin does not exist yet, because the production server has not been
deployed (see `FINAL_PROJECT_STATUS.md`). It is created **on your server, by you, during
deployment**, with the procedure below. The procedure itself was tested on the isolated test stack:
create, refusal of duplicates, reset, forced password change, session sign-out and the audit entry
(see `FINAL_TEST_RESULTS.md`).

No password for your production system exists anywhere: not in GitHub, the reports, `.env` files or
any log. It is generated on your server and shown **once** on your screen.

## 1. Create the first Super Admin (on the server console)

After the stack is running (`FINAL_DEPLOYMENT_GUIDE.md`), open PowerShell **on the server** in the
project folder and run:

```powershell
docker compose --env-file .env.production exec api npx tsx prisma/super-admin.ts create --email you@yourcompany.com --mobile 98XXXXXXXX --name "Your Name"
```

It prints:

```
================================================================
 Super Admin created

   User ID          : SA001
   One-time password: ••••••••••••••••   (16 random characters)

 Shown only now. ...
================================================================
```

* **Super Admin User ID:** `SA001` (the first Super Admin always gets SA001).
* **One-time password:** shown only on that screen. Write it on paper, or type it straight into the
  login page, then clear the terminal (`cls`). It is stored only as a bcrypt hash.
* Use your own company email and mobile: they're used for alerts and the email test.

The public "initial setup" web page is **disabled in production**. Otherwise anyone who reached a
fresh server first could make themselves Super Admin.

## 2. First sign-in

1. Open **`https://<your-domain>/`** (the production URL, once the domain and HTTPS are set up).
2. Choose **Password login**, enter User ID `SA001` and the one-time password.
3. You're taken straight to **Change password**. The new password needs at least 10 characters with
   an uppercase letter and a number, and can't reuse the one-time password. Until it's changed,
   every other page is blocked.
4. Turn on **two-factor authentication** (Security → 2FA, any authenticator app) and save the
   backup codes with your secrets.

## 3. Create the emergency (break-glass) account (do this on day 1)

```powershell
docker compose --env-file .env.production exec api npx tsx prisma/super-admin.ts create --break-glass --email it-emergency@yourcompany.com --mobile 97XXXXXXXX
```

Sign in once with it, change the password, enable 2FA, then seal the credentials (password manager
plus a sealed envelope). Use it only if SA001 is unavailable.

## 4. Admin and HR accounts

As Super Admin: **Admin & Users → Add user**, choose the role **Admin** or **HR**. Each person gets
their own account. Shared logins are not supported, and every action is audit-logged per person.

| Role | Can | Cannot |
|---|---|---|
| Super Admin | Everything: payroll runs, approvals, TDS opening balances, final employee import, users, audit log, backups, system health, email settings | — |
| Admin | View employees, reports, attendance, import preview | Edit employee contacts, payroll runs, users, audit, backups, import commit |
| HR | Employees (create/edit incl. mobile/email), attendance, leave, CTC, import preview, welcome emails | Payroll runs, users, audit, backups, import commit |
| Employee | Own profile, attendance (selfie + GPS), leave, own payslips | Anyone else's data; editing own profile (changes go through HR) |

These rules were verified role by role (77 checks, `FINAL_TEST_RESULTS.md`). Note: payroll runs are
Super Admin only, as the code intends. If HR should run payroll, that is a one-line change; ask.

## 5. Changing your password later

Open **`/account/password`** (Change password): enter the current password, then the new one twice.
To sign out sessions on other devices, use **Admin & Users → sessions → force logout**.

## 6. Recovery

| Situation | What to do |
|---|---|
| Forgot password / locked out | Sign in with the break-glass account → Admin & Users → reset SA001's password |
| Both accounts unavailable | On the server console: `docker compose --env-file .env.production exec api npx tsx prisma/super-admin.ts reset --login SA001`. This prints a new one-time password, unlocks the account, forces a password change and **signs out all its sessions** |
| Lost the 2FA phone | Same command with `--reset-2fa`, then set 2FA up again after signing in |
| Who are the Super Admins? | `docker compose --env-file .env.production exec api npx tsx prisma/super-admin.ts list` |

Every create and reset is written to the audit log (event and User ID only, never the password).
Only someone with console access to the server can run these commands, so keep the server
physically secure and remote administration behind a VPN.

There is no "forgot password" link for administrators on purpose: an emailed reset link for a
Super Admin is a takeover path if the mailbox is compromised. Employees don't need passwords at all.
They sign in with their mobile number and an email OTP.
