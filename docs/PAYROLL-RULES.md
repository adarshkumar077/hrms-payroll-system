# Payroll statutory rules (TDS, PF, ESI, PT)

> ## ⚠️ VERIFY WITH CA BEFORE GO-LIVE
>
> Every default value in this document, and in the seeded `statutory_rule_sets` rows, is marked
> `verifyWithCA: true`. They were entered from the author's reading of the Finance Act 2025, the
> EPF & MP Act, the ESI Act and state professional-tax schedules. **No chartered accountant has
> checked them.** Before the first live payroll, a CA must check each table below against the
> current law for the company's establishment and states, and correct the rows in
> `statutory_rule_sets`. The FY 2026-27 values are the FY 2025-26 values carried forward. Check
> them against the Income-tax Act 2025 and any Budget 2026 changes.

Task T9 (audit finding C5). Before this change, TDS was a flat 1% of gross, PF was a fixed ₹3,600, ESI
did not exist, and professional tax was a flat amount typed in per employee.

## Where things live

| What | Where |
|---|---|
| Rule tables (data) | `statutory_rule_sets` table: one row per company per financial year (`"2026-27"`), `rules` JSONB |
| Rule schema + validation | `apps/api/src/payroll/statutory/types.ts` (`parseStatutoryRules`) |
| Default values | `apps/api/src/payroll/statutory/defaults.ts` |
| Seeding | `prisma/seed.ts` and `prisma/sync-settings.ts` call `seedStatutoryRuleSets`. It is idempotent and **never overwrites** an existing row. |
| Engine (pure functions) | `apps/api/src/payroll/statutory/income-tax.ts`, `contributions.ts`, `prior.ts` |
| Wiring | `calcPayrollPreview` in `apps/api/src/payroll/payroll-calculator.ts`; `PayrollService.generate` |
| Employee inputs | `employees.tax_regime` (NEW / OLD, default NEW), `employees.old_regime_declared_deductions`, `employees.pt_state` |
| Employer contributions | `payroll_lines.employer_pf_eps`, `employer_pf_epf`, `employer_esi`, plus the `statutory_json` breakdown |
| Read-only UI | Web → Payroll → **Statutory Rules** (`/payroll/statutory`), API `GET /payroll/statutory-rules?financialYear=2026-27` |
| Employee UI | Employee → Salary tab: tax regime, declared deductions, PT state, and a mode for each deduction |

If a company has no row for a FY, the built-in defaults for that FY label are used. If a stored row
fails validation, payroll generation is refused with a 400 error. It never quietly falls back to
the defaults.

## Per-employee toggles and overrides

Each of PF, ESI, TDS and PT in `employee_payroll_configs.config_json.deductions` has:

- `enabled: false`: not deducted.
- `mode: 'statutory'`: computed by the engine from the rule tables (the default for new configs).
- `mode: 'fixed'` (`value`): manual monthly amount. This is the per-employee override.
- `mode: 'percent'` (`value`): % of gross. This is legacy and is kept for configs that already use it.

Migrating legacy JSON (`normalizePayrollConfig`):

| Legacy value | Becomes |
|---|---|
| TDS `{ mode: 'percent', value: 1 }` (the old forced 1%) | `statutory` (the old value was never a per-employee choice) |
| TDS `mode: 'fixed'` | unchanged (manual override) |
| PF `mode: 'fixed'` / `'percent'` | unchanged (manual override, e.g. the old ₹3,600) |
| PF without a mode | `statutory` |
| PT with `amount > 0` and no mode | `fixed` at that amount (the old behaviour is kept) |
| PT with `amount = 0` and no mode | `statutory` |
| ESI (new key) | `{ enabled: false, mode: 'statutory' }` |

New configs default to: PF off, ESI off, TDS on (statutory), and PT on (statutory). PT stays ₹0 until a PT
state is set.

Employer contributions (EPS, EPF, ESI) are computed **only in statutory mode**. For a fixed or percent PF/ESI
override they are stored as 0.

## Wage bases used

For an employee with a payroll config:

- **Monthly gross** (used for ESI, PT and TDS) = configured gross + allowances (+ attendance incentive) −
  LOP. Reimbursements are excluded. This matches the salary preview.
- **PF wage (Basic + DA)** = the `basic` allowance − LOP when basic > 0. Otherwise it is the configured gross.
  There is no separate DA field: put DA into basic.
- Employees paid **only from a salary structure** (no payroll config) keep the deductions in their
  structure. The engine is **not** applied to them. See Limitations.

## Income tax / TDS

Order: slab tax → section 87A rebate (with marginal relief) → surcharge (with marginal relief) →
4% cess. Each component is rounded HALF_UP to 2dp, and the total is their exact sum.

**Taxable income** = annual gross − standard deduction − (old regime only) declared Chapter VI-A
deductions − professional tax (u/s 16(iii), old regime only). It is never negative.

### New regime (default) — FY 2025-26 and FY 2026-27

| Taxable income | Rate |
|---|---|
| 0 – 4,00,000 | 0% |
| 4,00,001 – 8,00,000 | 5% |
| 8,00,001 – 12,00,000 | 10% |
| 12,00,001 – 16,00,000 | 15% |
| 16,00,001 – 20,00,000 | 20% |
| 20,00,001 – 24,00,000 | 25% |
| Above 24,00,000 | 30% |

- Standard deduction ₹75,000.
- 87A rebate: the full tax up to ₹60,000 when taxable income ≤ ₹12,00,000. **Marginal relief:** just above
  ₹12L, the tax before cess cannot exceed (taxable income − ₹12,00,000).
- Surcharge: 10% above ₹50L, 15% above ₹1Cr, 25% above ₹2Cr (capped at 25%).

### Old regime

| Taxable income | Rate |
|---|---|
| 0 – 2,50,000 | 0% |
| 2,50,001 – 5,00,000 | 5% |
| 5,00,001 – 10,00,000 | 20% |
| Above 10,00,000 | 30% |

- Standard deduction ₹50,000.
- 87A rebate up to ₹12,500 when taxable income ≤ ₹5,00,000. There is no marginal relief.
- Surcharge: 10% above ₹50L, 15% above ₹1Cr, 25% above ₹2Cr, 37% above ₹5Cr.
- Declared deductions: `employees.old_regime_declared_deductions`, entered as **one annual total**
  (80C + 80D + 80CCD(1B) + HRA exemption + …). **HR must include the employee's own PF contribution in
  the 80C figure.** The engine does not add it automatically, and it does not apply the ₹1.5L 80C cap.

### Cess and surcharge marginal relief

- Health & education cess: 4% of (tax after rebate + surcharge).
- Surcharge marginal relief: tax + surcharge at income *I* above a threshold *T* may not exceed
  (tax + surcharge at *T*, using the rate that applies at *T*) + (*I* − *T*).

### Monthly TDS (projection)

For a payroll month in FY *Y* (April = month 1 of 12):

```
monthsRemaining     = 12 − index(month)          (April 12 … March 1)
priorTaxableGross   = Σ statutory_json.monthlyGross of APPROVED/LOCKED lines earlier in the FY
                      (lines from before T9: grossEarnings − reimbursements)
projectedAnnualGross = priorTaxableGross + thisMonthGross × monthsRemaining
projectedPT          = priorPT + thisMonthPT × monthsRemaining
annualTax            = computeAnnualTax(regime, taxableIncome(projectedAnnualGross, …))
monthlyTDS           = max(0, annualTax − TDS already deducted this FY) ÷ monthsRemaining,
                       rounded HALF_UP to the nearest rupee
```

Only **APPROVED / LOCKED** runs count as "already deducted". DRAFT and REVIEW runs are ignored.

The salary-config preview (and the attendance payroll export) shows a **steady-state estimate**:
gross × 12 annualised, with nothing paid yet, so monthly TDS = annual tax ÷ 12.

## Provident Fund (EPF & MP Act)

| Setting | Default |
|---|---|
| Wage ceiling | ₹15,000 per month |
| Restrict to ceiling (company option `pf.restrictToWageCeiling`) | `true`. Set it to `false` to compute on actual Basic + DA. |
| Employee | 12% of PF wage |
| Employer total | 12% of PF wage |
| EPS (pension) | 8.33% of min(PF wage, ₹15,000). This is at most ₹1,250. |
| EPF (employer) | employer total − EPS (3.67%, plus all of the excess when not restricted) |
| Rounding | nearest rupee (HALF_UP) per line |

```
pfWage   = restrict ? min(basic + DA, ceiling) : basic + DA
employee = round(pfWage × 12%)
employer = round(pfWage × 12%)
EPS      = min(round(min(pfWage, 15,000) × 8.33%), employer)
EPF      = employer − EPS
```

## ESI (ESI Act)

| Setting | Default |
|---|---|
| Gross threshold | ₹21,000 per month (≤ threshold → covered) |
| Employee | 0.75% of gross |
| Employer | 3.25% of gross |
| Rounding | **up** to the next whole rupee (ESIC practice) |
| Contribution periods | on: April–September and October–March |

**Contribution period rule (implemented):** if the employee was ESI-covered in the **first approved
payroll month of the current contribution period**, they stay covered for the rest of that period,
even if their gross rises above ₹21,000. Contributions are then charged on the actual gross. If they
were not covered at the start of the period, eligibility is decided each month on that month's gross.

## Professional tax (state-wise, monthly gross)

PT state comes from `employees.pt_state`. Leaving it empty or `NONE` means no PT.

| State | Slabs (monthly gross → PT per month) |
|---|---|
| Maharashtra (MH) | Men: ≤ 7,500 → 0; 7,501–10,000 → 175; > 10,000 → 200, **February 300**. Women: ≤ 25,000 → 0; > 25,000 → 200, **February 300** |
| Karnataka (KA) | < 25,000 → 0; ≥ 25,000 → 200, **February 300** (2025 amendment) |
| West Bengal (WB) | ≤ 10,000 → 0; 10,001–15,000 → 110; 15,001–25,000 → 130; 25,001–40,000 → 150; > 40,000 → 200 |
| Tamil Nadu (TN) | Half-yearly income: ≤ 21,000 → 0; 21,001–30,000 → 180; 30,001–45,000 → 425; 45,001–60,000 → 930; 60,001–75,000 → 1,025; > 75,000 → 1,250 per half-year |
| Telangana (TS) | ≤ 15,000 → 0; 15,001–20,000 → 150; > 20,000 → 200 |
| Andhra Pradesh (AP) | ≤ 15,000 → 0; 15,001–20,000 → 150; > 20,000 → 200 |
| Gujarat (GJ) | < 12,000 → 0; ≥ 12,000 → 200 |
| NONE | 0 |

- The Maharashtra and Karnataka February ₹300 rule is modelled as a per-slab `monthOverrides: { "2": 300 }`.
- The Maharashtra women's slab is used when `employees.gender` starts with "F".
- **Tamil Nadu is half-yearly in law. It is modelled as a monthly equivalent:** monthly gross × 6 is matched
  to the half-yearly slab, and the half-yearly amount ÷ 6 is deducted each month (2dp). For example,
  ₹1,250 ÷ 6 = ₹208.33. Over 6 months this totals ₹1,249.98, not ₹1,250. TN rates also vary by local
  body; the Chennai Corporation rates are shown.

## Limitations (known, not implemented)

- Old regime: senior (60+) and super-senior (80+) slabs are not modelled. Everyone uses the below-60 slabs.
- No 80C cap and no itemised Chapter VI-A heads. Declared deductions are one total, and employee PF must be included in it by hand.
- HRA exemption (section 10(13A)), LTA, perquisites and Form 12BA valuations are not computed. Include any exemption in the declared total.
- Previous-employer income (Form 12B) for joiners partway through the year is not captured. The projection only counts payroll in this system.
- Income is not rounded to the nearest ₹10 (section 288A), and tax is not rounded to the nearest ₹10 (section 288B). The engine computes to the paisa and rounds monthly TDS to the rupee.
- Special-rate income (capital gains, etc.) is ignored. Only salary is taxed.
- Surcharge marginal relief is implemented for every threshold. The new-regime 25% cap is applied through the data (there is no 37% slab).
- PF: EDLI (0.5%) and admin charges (0.5%) are not computed. The EPS rules for members who joined after 1 Sep 2014 earning above ₹15,000 (not eligible for EPS) are not modelled. Voluntary PF is not supported.
- ESI: the rule that exempts the employee share for daily wages ≤ ₹176 is not modelled. The engine does not check whether the establishment is covered (10+ employees): HR enables ESI per employee.
- PT: only the 7 states above are seeded. Other states need a row added to `professionalTax` in the rule set. Annual-cap reconciliation (for example, a joiner after February in MH) is not done.
- **Existing issue found during T9, not fixed here:** for config-based employees, `PayrollService.generate`
  builds payslip earnings only from the *allowances* in the config. The configured `grossMonthly` is not
  added as an earning, but the preview and the statutory base treat salary as gross + allowances. A
  gross-only employee therefore gets payslip earnings of ~₹0, and the statutory deductions are then capped
  so net = 0. This was also true with the old 1% TDS. Fix the earnings composition before go-live.
- Salary-structure-only employees (no payroll config): statutory deductions come from their structure lines, as before.
- The attendance payroll export uses the steady-state preview with the company's default rules (new regime, no PT state) and adds ESI into "Other deductions". The payroll run is the source of truth.
- Editing rule sets: there is no UI yet. Update `statutory_rule_sets.rules` directly (it is validated on read).

## Behaviour changes compared with the old flat rules

| | Before | After |
|---|---|---|
| TDS | 1% of gross for everyone, cannot be turned off | Slab-based projected annual tax (new regime by default). Many salaries under ~₹1.06L/month now pay **₹0** TDS (87A rebate); high salaries pay much more than 1%. It can be set to a fixed amount or turned off per employee. |
| PF | Fixed ₹3,600 when enabled | Existing fixed amounts are kept. New or statutory configs use 12% of capped Basic (₹1,800 at the ceiling). |
| ESI | Not supported | 0.75% / 3.25% when enabled and gross ≤ ₹21,000 |
| PT | A flat amount per employee | Existing amounts are kept as fixed overrides. Statutory mode uses state slabs. |
| Payroll line | Deductions only | Also stores employer EPS / EPF / ESI and a statutory breakdown |

## Golden tests

`apps/api/src/payroll/statutory/income-tax.spec.ts` and `contributions.spec.ts`, plus updated cases in
`payroll-calculator.spec.ts`. The expected values were computed independently with Python's `decimal`
module (ROUND_HALF_UP).

| Case | Expected |
|---|---|
| New regime, taxable ₹7,00,000 | ₹0 (rebate ₹15,000) |
| New regime, taxable ₹12,00,000 | ₹0 (rebate ₹60,000) |
| New regime, taxable ₹12,10,000 | ₹10,400 (tax ₹10,000 after marginal relief, + ₹400 cess) |
| New regime, taxable ₹15,00,000 | ₹1,09,200 |
| New regime, taxable ₹30,00,000 | ₹4,99,200 |
| New regime, taxable ₹60,00,000 | ₹15,78,720 (10% surcharge ₹1,38,000) |
| New regime, taxable ₹50,10,000 | ₹11,33,600 (surcharge after relief ₹7,000) |
| Old regime, taxable ₹5,00,000 | ₹0 |
| Old regime, gross ₹8,00,000 with ₹1.5L 80C (taxable ₹6L) | ₹33,800 |
| Old regime, taxable ₹15,00,000 | ₹2,73,000 |
| Monthly TDS, October, ₹1.5L/month, ₹7.5L paid and ₹30,000 TDS so far | ₹15,150 |
| PF at basic 12,000 / 15,000 / 40,000 (ceiling on) / 40,000 (off) | 1,440 / 1,800 / 1,800 / 4,800; EPS 1,000 / 1,250 / 1,250 / 1,250 |
| ESI at gross 20,000 / 21,000 / 21,001 | 150 + 650 / 158 + 683 / not applicable |
