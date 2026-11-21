import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { migrateSelfies, type SelfieMigrationPrisma } from './selfie-migration';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 7)]);
const DATA = `data:image/jpeg;base64,${JPEG.toString('base64')}`;

type Row = Record<string, unknown>;

function fakeTable(rows: Row[]) {
  return {
    rows,
    async findMany(args: { where: Row; take: number }) {
      const col = Object.keys(args.where).find((k) => k !== 'id')!;
      const gt = (args.where.id as { gt?: string } | undefined)?.gt;
      return rows
        .filter((r) => typeof r[col] === 'string' && (r[col] as string).startsWith('data:image'))
        .filter((r) => !gt || String(r.id) > gt)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .slice(0, args.take)
        .map((r) => ({ ...r }));
    },
    async updateMany(args: { where: Row; data: Row }) {
      const hit = rows.filter((r) =>
        Object.entries(args.where).every(([k, v]) => r[k] === v),
      );
      hit.forEach((r) => Object.assign(r, args.data));
      return { count: hit.length };
    },
  };
}

function setup() {
  const date = new Date('2026-02-03T00:00:00Z');
  const records = fakeTable([
    { id: 'r1', companyId: 'c1', date, selfieUrl: DATA, checkInSelfieUrl: DATA, checkOutSelfieUrl: null },
    { id: 'r2', companyId: 'c1', date, selfieUrl: null, checkInSelfieUrl: 'storage:already', checkOutSelfieUrl: DATA },
    { id: 'r3', companyId: 'c1', date, selfieUrl: 'data:image/jpeg;base64,bm90YW5pbWFnZQ==', checkInSelfieUrl: null, checkOutSelfieUrl: null },
  ]);
  const punches = fakeTable([
    { id: 'p1', companyId: 'c1', recordId: 'r1', punchType: 'IN', punchedAt: date, selfieUrl: DATA },
    { id: 'p2', companyId: 'c1', recordId: 'r2', punchType: 'OUT', punchedAt: date, selfieUrl: DATA },
  ]);
  const puts: Array<{ key: string; size: number }> = [];
  const storage = {
    async put(key: string, buf: Buffer) {
      puts.push({ key, size: buf.length });
    },
  };
  const prisma = { attendanceRecord: records, attendancePunch: punches } as unknown as SelfieMigrationPrisma;
  return { records, punches, puts, storage, prisma };
}

describe('migrateSelfies', () => {
  it('dry-run counts rows and bytes without writing', async () => {
    const { prisma, storage, puts, records } = setup();
    const stats = await migrateSelfies(prisma, storage, { apply: false, batchSize: 1 });
    assert.equal(stats.migratable, 5); // r1 x2, r2 out, p1, p2
    assert.equal(stats.invalid, 1); // r3 not a real image
    assert.equal(stats.bytes, 5 * JPEG.length);
    assert.equal(stats.uploaded, 0);
    assert.equal(stats.rewritten, 0);
    assert.equal(puts.length, 0);
    assert.equal(records.rows[0].selfieUrl, DATA);
  });

  it('apply uploads, rewrites to storage: keys, and is idempotent', async () => {
    const { prisma, storage, puts, records, punches } = setup();
    const first = await migrateSelfies(prisma, storage, { apply: true, batchSize: 2 });
    assert.equal(first.uploaded, 5);
    assert.equal(first.rewritten, 5);
    assert.equal(puts.length, 5);
    assert.match(String(records.rows[0].checkInSelfieUrl), /^storage:selfies\/c1\/2026-02\/r1-in-[0-9a-f]+\.jpg$/);
    assert.match(String(records.rows[1].checkOutSelfieUrl), /^storage:selfies\/c1\/2026-02\/r2-out-/);
    assert.match(String(punches.rows[1].selfieUrl), /^storage:selfies\/c1\/2026-02\/r2-out-/);
    assert.equal(records.rows[1].checkInSelfieUrl, 'storage:already');
    assert.equal(records.rows[2].selfieUrl.toString().startsWith('data:image'), true, 'invalid left untouched');

    const second = await migrateSelfies(prisma, storage, { apply: true });
    assert.equal(second.migratable, 0);
    assert.equal(second.uploaded, 0);
    assert.equal(puts.length, 5);
  });
});
