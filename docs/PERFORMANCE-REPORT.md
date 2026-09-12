# Performance & Load Testing Report

> Run tests against your production URL after VPS deployment.
> Replace `BASE_URL` with your permanent HTTPS link.

## Test environment

| Item | Value |
|------|-------|
| Date | _fill after deploy_ |
| URL | _https://hrms.yourcompany.com_ |
| VPS | _Hetzner CX22 / DO 4GB / etc._ |
| Stack | Docker Compose (nginx + api + web + postgres + redis) |

## Load test results

Run:
```bash
node scripts/load-test.mjs BASE_URL 10
node scripts/load-test.mjs BASE_URL 15
node scripts/load-test.mjs BASE_URL 20
```

| Concurrency | Requests | Failed | Avg (ms) | P95 (ms) | Max (ms) | Pass |
|-------------|----------|--------|----------|----------|----------|------|
| 10 | | | | | | |
| 15 | | | | | | |
| 20 | | | | | | |

**Targets:** avg < 500 ms, p95 < 2000 ms, 0 failures.

## Scenarios covered

- [x] Login
- [x] Dashboard (HR + Employee)
- [x] Attendance punch in/out
- [x] Leave balances
- [x] Payroll runs list
- [x] CRM lead list + create
- [x] CRM tasks
- [x] Employee search
- [x] Profile read
- [x] Notifications
- [x] Web home + dashboard pages

## Soak test (stability)

```bash
node scripts/soak-test.mjs BASE_URL 1440 60   # 24 hours, every 60s
```

| Duration | Cycles | Errors | Avg latency | Notes |
|----------|--------|--------|-------------|-------|
| 1 hour | | | | |
| 24 hours | | | | |
| 15 days | | | | _office pilot_ |

## Resource usage (docker stats)

| Container | CPU % | RAM | Notes |
|-----------|-------|-----|-------|
| api | | | |
| web | | | |
| postgres | | | |
| nginx | | | |
| redis | | | |

## Bottlenecks found & fixes

| Issue | Fix applied |
|-------|-------------|
| _example: slow employee list_ | _pagination + index on companyId_ |
| | |

## Conclusion

_System ready for 10–15 daily users: YES / NO_

Signed off: _______________  Date: _______________
