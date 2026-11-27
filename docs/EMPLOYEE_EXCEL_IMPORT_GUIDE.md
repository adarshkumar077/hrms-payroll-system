# Employee Excel import guide

Use this to load the real employee master list **once, on the production server, after the launch
checklist is complete**. Nothing has been imported yet. The import needs explicit approval from you
and a Super Admin on the day.

Menu: **Setup → Secure Employee Import** (`/employee-import`). HR and Admin can upload and preview,
but only a **Super Admin** can approve the final import.

## 1. Prepare the file

Download the template from the page (**Download template**), or use your own sheet with these
headers. Common aliases are accepted, for example *Emp Code*, *Phone*, *DOJ*, *Dept*.

| Column | Required | Rules |
|---|---|---|
| Employee ID | yes | Unique in the company; it is never overwritten if it already exists |
| Full Name (or First Name + Last Name) | yes | Text only; values starting with `= + - @` are rejected (formula protection) |
| Mobile Number | yes | 10-digit Indian mobile starting 6–9; `+91`, spaces and dashes are removed; **unique** |
| Email | yes | Valid address, stored in lowercase; **unique**. OTP login codes are sent here |
| Joining Date | yes | `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD` or an Excel date; impossible dates (31-02) are rejected |
| Department | yes | Text |
| Designation | yes | Text |
| Gross Monthly Salary | yes | Positive number; `45,000` is accepted |
| Date of Birth, Gender | no | Checked if present |

Limits: `.xlsx` or `.csv` only (checked by file content, not the file name), at most 5 MB and 5,000
rows. Other columns are listed as "ignored" and not stored.

## 2. Upload and preview

Choose the file, then click **Validate & preview**. Nothing is written to the employee tables. The
preview shows:

* **ready**: will be created;
* **exists — skipped**: the Employee ID is already in the system (safe re-import, never overwritten);
* **error**: with the field and the reason, for example *"duplicate of row 2"*, *"already registered
  to employee EITF014"*, *"not a valid 10-digit mobile"*.

**Download error report (CSV)** gives the full list to send back to whoever maintains the sheet. The
report holds row numbers, IDs and reasons only.

Fix the sheet and preview again until the error count is **0**. If any row has an error, nothing is
imported. Rows are never imported partially.

## 3. Approve (Super Admin)

1. Take a fresh backup (Security → Backups, or `backup.sh once`) and check that it succeeded.
2. As Super Admin, upload **the same file** again and preview it.
3. Tick *"I confirm a verified database backup was taken in the last 24 hours"*.
4. Click **Import N new employee(s)** and confirm.

The server refuses the import if:
* the user is not a Super Admin;
* the file differs from the previewed one (SHA-256 check);
* the preview is older than 24 hours or has already been used;
* the backup is not confirmed, or the server's backup status shows no successful backup within 24
  hours;
* any row has an error when it is re-checked.

For each new employee the import creates the employee record, a login (role *Employee*, forced
password change, random initial password), and a payroll configuration with the gross salary
effective from the joining date. Employees sign in with **mobile OTP by email**, or HR resets their
password.

## 4. After the import

* Check the totals on the result banner and in **Import history**.
* Spot-check 5 employees: mobile, email, department, gross salary.
* Fill in statutory details that are not in the sheet (PAN, UAN, bank account, PF/ESI/ESD options)
  on each employee's page before the first payroll run.
* **Mid-year joiners / year-to-date TDS:** the import does **not** bring in salary or TDS already
  paid this financial year. Do not run live payroll until that is settled (see
  `PROJECT_FINAL_STATUS.md`, item R1).

## 5. Audit trail

Every preview and import writes an `ImportJob` record (file name, SHA-256, counts, row reasons, who
and when) and an audit log entry. Personal data from the file is not copied into the job record.

## 6. The old Import / Export page

`/import-export` still exports data and dry-runs other entities. Its old employee bulk import is
**disabled**, because it skipped validation. It points to this page instead.
