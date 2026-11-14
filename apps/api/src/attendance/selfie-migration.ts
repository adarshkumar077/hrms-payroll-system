import { buildSelfieKey, decodeSelfieDataUrl, SELFIE_KEY_PREFIX } from './selfie-storage';

/** Minimal surface of the Prisma delegates the migration needs (keeps it mockable). */
export interface SelfieTableDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { id: 'asc' };
    take: number;
    select: Record<string, boolean>;
  }): Promise<Array<Record<string, unknown>>>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

export interface SelfieMigrationPrisma {
  attendanceRecord: SelfieTableDelegate;
  attendancePunch: SelfieTableDelegate;
}

export interface SelfieMigrationStorage {
  put(key: string, buffer: Buffer, contentType: string): Promise<unknown>;
}

export interface SelfieMigrationStats {
  scanned: number;
  migratable: number;
  invalid: number;
  bytes: number;
  uploaded: number;
  rewritten: number;
  byColumn: Record<string, { rows: number; bytes: number }>;
}

type ColumnSpec = {
  table: 'attendanceRecord' | 'attendancePunch';
  column: 'selfieUrl' | 'checkInSelfieUrl' | 'checkOutSelfieUrl';
};

const COLUMNS: ColumnSpec[] = [
  { table: 'attendanceRecord', column: 'selfieUrl' },
  { table: 'attendanceRecord', column: 'checkInSelfieUrl' },
  { table: 'attendanceRecord', column: 'checkOutSelfieUrl' },
  { table: 'attendancePunch', column: 'selfieUrl' },
];

export async function migrateSelfies(
  prisma: SelfieMigrationPrisma,
  storage: SelfieMigrationStorage,
  opts: { apply: boolean; batchSize?: number; log?: (m: string) => void },
): Promise<SelfieMigrationStats> {
  const batchSize = opts.batchSize ?? 50;
  const log = opts.log ?? (() => undefined);
  const stats: SelfieMigrationStats = {
    scanned: 0,
    migratable: 0,
    invalid: 0,
    bytes: 0,
    uploaded: 0,
    rewritten: 0,
    byColumn: {},
  };

  for (const { table, column } of COLUMNS) {
    const label = `${table}.${column}`;
    stats.byColumn[label] = { rows: 0, bytes: 0 };
    const delegate = prisma[table];
    let cursor: string | null = null;

    for (;;) {
      const where: Record<string, unknown> = { [column]: { startsWith: 'data:image' } };
      if (cursor) where.id = { gt: cursor };
      const select: Record<string, boolean> = { id: true, companyId: true, [column]: true };
      if (table === 'attendancePunch') {
        select.recordId = true;
        select.punchType = true;
        select.punchedAt = true;
      } else {
        select.date = true;
      }
      const rows = await delegate.findMany({ where, orderBy: { id: 'asc' }, take: batchSize, select });
      if (rows.length === 0) break;

      for (const row of rows) {
        cursor = String(row.id);
        stats.scanned += 1;
        const value = String(row[column]);
        let decoded;
        try {
          decoded = decodeSelfieDataUrl(value);
        } catch (e) {
          stats.invalid += 1;
          log(`skip ${label} ${row.id}: ${e instanceof Error ? e.message : e}`);
          continue;
        }
        stats.migratable += 1;
        stats.bytes += decoded.buffer.length;
        stats.byColumn[label].rows += 1;
        stats.byColumn[label].bytes += decoded.buffer.length;
        if (!opts.apply) continue;

        const isOut =
          column === 'checkOutSelfieUrl' ||
          (table === 'attendancePunch' && String(row.punchType).toUpperCase() === 'OUT');
        const at = (table === 'attendancePunch' ? row.punchedAt : row.date) as Date;
        const recordId =
          table === 'attendancePunch' ? String(row.recordId ?? row.id) : String(row.id);
        const key = buildSelfieKey({
          companyId: String(row.companyId),
          recordId,
          punchType: isOut ? 'OUT' : 'IN',
          at: at instanceof Date ? at : new Date(at),
          mime: decoded.mime,
        });
        await storage.put(key, decoded.buffer, decoded.mime);
        stats.uploaded += 1;
        // Guard on the original value so a concurrent edit is never overwritten.
        const res = await delegate.updateMany({
          where: { id: row.id, [column]: value },
          data: { [column]: `${SELFIE_KEY_PREFIX}${key}` },
        });
        stats.rewritten += res.count;
      }
    }
  }
  return stats;
}
