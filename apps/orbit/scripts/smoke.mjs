#!/usr/bin/env node
// Golden-path smoke test for Orbit.
//
// Unauthenticated checks (always run):
//   - GET /login        -> 200, body contains "Orbit"
//   - GET /api/health   -> 200, JSON { status: "ok", ... }
//   - GET /             -> redirects to /login (307, or 200 if the runner follows it)
//
// Auth-optional checks (only run if ORBIT_SESSION_COOKIE is set):
//   - GET /dashboard, /leads, /opportunities, /tickets with the given Cookie header
//     -> 200 + body contains a known marker string for that page
//
// Usage:
//   node scripts/smoke.mjs
//   BASE_URL=https://orbit.example.com node scripts/smoke.mjs
//   ORBIT_SESSION_COOKIE="orbit_session=...; Path=/" node scripts/smoke.mjs
//
// Exit code: 0 if every check passes, 1 otherwise (with a ✓/✗ summary printed).

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = process.env.ORBIT_SESSION_COOKIE || "";

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "✓" : "✗"; // ✓ / ✗
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkLoginPage() {
  const name = "GET /login (200, body contains \"Orbit\")";
  try {
    const res = await fetch(new URL("/login", BASE_URL));
    const body = await res.text();
    if (res.status !== 200) {
      record(name, false, `expected 200, got ${res.status}`);
      return;
    }
    if (!body.includes("Orbit")) {
      record(name, false, "response body did not contain \"Orbit\"");
      return;
    }
    record(name, true);
  } catch (err) {
    record(name, false, String(err));
  }
}

async function checkHealth() {
  const name = "GET /api/health (200, JSON status ok)";
  try {
    const res = await fetch(new URL("/api/health", BASE_URL));
    if (res.status !== 200) {
      record(name, false, `expected 200, got ${res.status}`);
      return;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      record(name, false, `expected JSON content-type, got "${contentType}"`);
      return;
    }
    const json = await res.json();
    if (json.status !== "ok") {
      record(name, false, `expected status "ok", got ${JSON.stringify(json)}`);
      return;
    }
    record(name, true);
  } catch (err) {
    record(name, false, String(err));
  }
}

async function checkRootRedirect() {
  const name = "GET / (redirects to /login)";
  try {
    const res = await fetch(new URL("/", BASE_URL), { redirect: "manual" });
    // Depending on the runtime/runner, a manual redirect can surface as a 3xx
    // status with a Location header, or as an opaqueredirect (status 0) if
    // the fetch implementation doesn't expose the details. Either is fine.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || "";
      if (!location.includes("/login")) {
        record(name, false, `redirected, but Location was "${location}", expected it to contain /login`);
        return;
      }
      record(name, true, `${res.status} -> ${location}`);
      return;
    }
    if (res.type === "opaqueredirect" || res.status === 0) {
      record(name, true, "opaque redirect (fetch could not expose target, treated as pass)");
      return;
    }
    // Some runners auto-follow redirects even in "manual" mode (e.g. certain
    // proxies) — accept a landed-on-login 200 as a pass too, per spec.
    if (res.status === 200) {
      const finalUrl = res.url || "";
      if (finalUrl.includes("/login")) {
        record(name, true, `followed to ${finalUrl}`);
        return;
      }
    }
    record(name, false, `expected a redirect to /login, got ${res.status}`);
  } catch (err) {
    record(name, false, String(err));
  }
}

const AUTH_PAGES = [
  { path: "/dashboard", marker: "Pipeline by stage" },
  { path: "/leads", marker: "Leads" },
  { path: "/opportunities", marker: "Pipeline" },
  { path: "/tickets", marker: "Tickets" },
];

async function checkAuthPage(path, marker) {
  const name = `GET ${path} (200, body contains "${marker}")`;
  try {
    const res = await fetch(new URL(path, BASE_URL), {
      headers: { Cookie: SESSION_COOKIE },
    });
    if (res.status !== 200) {
      record(name, false, `expected 200, got ${res.status}`);
      return;
    }
    const body = await res.text();
    if (body.length === 0) {
      record(name, false, "response body was empty");
      return;
    }
    if (!body.includes(marker)) {
      record(name, false, `response body did not contain "${marker}"`);
      return;
    }
    record(name, true);
  } catch (err) {
    record(name, false, String(err));
  }
}

async function main() {
  console.log(`Orbit smoke test against ${BASE_URL}\n`);

  console.log("-- unauthenticated checks --");
  await checkLoginPage();
  await checkHealth();
  await checkRootRedirect();

  if (SESSION_COOKIE) {
    console.log("\n-- auth-optional checks (ORBIT_SESSION_COOKIE set) --");
    for (const { path, marker } of AUTH_PAGES) {
      await checkAuthPage(path, marker);
    }
  } else {
    console.log("\n-- auth-optional checks skipped (ORBIT_SESSION_COOKIE not set) --");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failed) {
      console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
