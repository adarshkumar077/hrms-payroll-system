import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// GAPS #6: proves cross-tenant reads/writes are actually blocked by `scopedDb()`
// (lib/tenantDb.ts), not just "should be" by convention. Runs against a throwaway
// SQLite file — NEVER touches prisma/dev.db.
//
// Approach: point DATABASE_URL at a scratch file *before* the shared `db` singleton
// (lib/db.ts) is first imported, so `scopedDb()` — which extends that same singleton —
// transparently operates on the test database. We use a real DB rather than mocking,
// per GAPS #6's ask for an actual integration test.

// Relative "file:./test-iso.db" mirrors this project's own DATABASE_URL convention
// (.env uses "file:./dev.db") — Prisma resolves SQLite relative paths against the
// schema.prisma directory (prisma/), both for the CLI and the generated client at
// runtime, so this lands at prisma/test-iso.db regardless of process cwd.
const TEST_DATABASE_URL = "file:./test-iso.db";
const TEST_DB_PATH = path.resolve(__dirname, "../prisma/test-iso.db");

function cleanupDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scopedDb: (tenantId: string) => any;

let tenantA: { id: string };
let tenantB: { id: string };

beforeAll(async () => {
  cleanupDbFiles(); // in case a previous crashed run left the file behind

  // Push the current schema onto the scratch DB. --skip-generate: the client is
  // already generated (from `npm run setup`); we only need the schema materialized.
  try {
    execSync("npx prisma db push --skip-generate --schema=prisma/schema.prisma", {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });
  } catch (err: any) {
    const output = err?.stdout?.toString?.() ?? err?.message ?? String(err);
    throw new Error(`prisma db push against scratch DB failed:\n${output}`);
  }

  // Point the shared singleton at the scratch DB, THEN import it for the first
  // time in this test file, so its `new PrismaClient()` construction reads this URL.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  ({ db } = await import("./db"));
  ({ scopedDb } = await import("./tenantDb"));

  tenantA = await db.tenant.create({ data: { name: "Tenant A (isolation test)" } });
  tenantB = await db.tenant.create({ data: { name: "Tenant B (isolation test)" } });

  await db.lead.create({ data: { tenantId: tenantA.id, name: "Lead A1" } });
  await db.lead.create({ data: { tenantId: tenantB.id, name: "Lead B1" } });

  await db.invoice.create({ data: { tenantId: tenantA.id, number: "INV-A-1" } });
  await db.invoice.create({ data: { tenantId: tenantB.id, number: "INV-B-1" } });
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  cleanupDbFiles();
});

describe("tenant isolation (GAPS #6) — real DB", () => {
  it("scopedDb(A).lead.findMany() returns only A's leads, never B's", async () => {
    const leadsA = await scopedDb(tenantA.id).lead.findMany();

    expect(leadsA.length).toBe(1);
    expect(leadsA.every((l: any) => l.tenantId === tenantA.id)).toBe(true);
    expect(leadsA.some((l: any) => l.tenantId === tenantB.id)).toBe(false);
    expect(leadsA.some((l: any) => l.name === "Lead B1")).toBe(false);
  });

  it("scopedDb(B).lead.findMany() returns only B's leads, never A's (symmetric check)", async () => {
    const leadsB = await scopedDb(tenantB.id).lead.findMany();

    expect(leadsB.length).toBe(1);
    expect(leadsB.every((l: any) => l.tenantId === tenantB.id)).toBe(true);
    expect(leadsB.some((l: any) => l.tenantId === tenantA.id)).toBe(false);
  });

  it("count() respects the tenant scope", async () => {
    const totalLeadsUnscoped = await db.lead.count();
    expect(totalLeadsUnscoped).toBe(2); // sanity: both tenants' rows really exist

    const countA = await scopedDb(tenantA.id).lead.count();
    const countB = await scopedDb(tenantB.id).lead.count();
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  it("scopedDb(A).invoice.findMany() also stays scoped (checks a second tenant-scalar model)", async () => {
    const invoicesA = await scopedDb(tenantA.id).invoice.findMany();
    expect(invoicesA.length).toBe(1);
    expect(invoicesA[0].number).toBe("INV-A-1");
    expect(invoicesA.some((i: any) => i.tenantId === tenantB.id)).toBe(false);
  });

  it("create() via scopedDb(A) lands under tenant A even without an explicit tenantId", async () => {
    const created = await scopedDb(tenantA.id).lead.create({ data: { name: "New Lead via scopedDb" } });
    expect(created.tenantId).toBe(tenantA.id);

    // Re-fetch with the raw (unscoped) client to prove it was actually persisted under A.
    const row = await db.lead.findUnique({ where: { id: created.id } });
    expect(row?.tenantId).toBe(tenantA.id);

    // And it must not leak into B's scoped view.
    const leadsB = await scopedDb(tenantB.id).lead.findMany();
    expect(leadsB.some((l: any) => l.id === created.id)).toBe(false);
  });
});
