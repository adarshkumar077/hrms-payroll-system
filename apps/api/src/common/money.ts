import { Prisma } from '@prisma/client';

/**
 * Money helpers (INR, 2-decimal paise) built on Prisma.Decimal (decimal.js).
 *
 * Rounding rule (one rule, used everywhere):
 *   compute in full precision, then round HALF_UP (half away from zero) to 2dp
 *   at each stored / displayed line item. Never round intermediate ratios such as
 *   a per-day rate before multiplying it by a day count.
 *
 * Money columns in Postgres are DECIMAL(14,2); Prisma returns them as Prisma.Decimal.
 * API responses convert them to JSON numbers with 2dp (see money-serialize.interceptor.ts).
 */
export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

export const MONEY_DP = 2;
const HALF_UP = Prisma.Decimal.ROUND_HALF_UP;
const ZERO = new Prisma.Decimal(0);

export function isDecimal(value: unknown): value is Prisma.Decimal {
  return Prisma.Decimal.isDecimal(value);
}

/** Build a Decimal. null / undefined / '' / NaN / Infinity become 0. */
export function money(value: MoneyInput): Prisma.Decimal {
  if (value == null) return ZERO;
  if (isDecimal(value)) return value.isFinite() ? value : ZERO;
  if (typeof value === 'number') return Number.isFinite(value) ? new Prisma.Decimal(value) : ZERO;
  const s = String(value).trim();
  if (!s) return ZERO;
  try {
    const d = new Prisma.Decimal(s);
    return d.isFinite() ? d : ZERO;
  } catch {
    return ZERO;
  }
}

/** Round HALF_UP to 2dp (the one money rounding rule). */
export function round2(value: MoneyInput): Prisma.Decimal {
  return money(value).toDecimalPlaces(MONEY_DP, HALF_UP);
}

export function add(...values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(money(v)), ZERO);
}

export function sub(a: MoneyInput, ...rest: MoneyInput[]): Prisma.Decimal {
  return rest.reduce<Prisma.Decimal>((acc, v) => acc.minus(money(v)), money(a));
}

export function mul(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return money(a).times(money(b));
}

/** Division; a zero / missing divisor yields 0 rather than Infinity. */
export function div(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  const d = money(b);
  if (d.isZero()) return ZERO;
  return money(a).dividedBy(d);
}

/** `pct` percent of `base` (unrounded). */
export function percentOf(base: MoneyInput, pct: MoneyInput): Prisma.Decimal {
  return money(base).times(money(pct)).dividedBy(100);
}

export function sum(values: Iterable<MoneyInput>): Prisma.Decimal {
  let acc = ZERO;
  for (const v of values) acc = acc.plus(money(v));
  return acc;
}

/** Sum a field across rows, e.g. sumBy(lines, (l) => l.netPay). */
export function sumBy<T>(rows: Iterable<T>, pick: (row: T) => MoneyInput): Prisma.Decimal {
  let acc = ZERO;
  for (const r of rows) acc = acc.plus(money(pick(r)));
  return acc;
}

export function max(...values: MoneyInput[]): Prisma.Decimal {
  return values.map(money).reduce((a, b) => (b.greaterThan(a) ? b : a));
}

export function min(...values: MoneyInput[]): Prisma.Decimal {
  return values.map(money).reduce((a, b) => (b.lessThan(a) ? b : a));
}

/** max(0, value) */
export function nonNegative(value: MoneyInput): Prisma.Decimal {
  const d = money(value);
  return d.isNegative() ? ZERO : d;
}

/** Rounded 2dp JS number for API output / JSON columns / exports. */
export function toNumber(value: MoneyInput): number {
  const n = round2(value).toNumber();
  return Object.is(n, -0) ? 0 : n;
}

/** Like toNumber but preserves null / undefined (for nullable money columns). */
export function toNumberOrNull(value: MoneyInput): number | null {
  if (value == null) return null;
  return toNumber(value);
}

/** Rounded 2dp Decimal for writing to a DECIMAL(14,2) column. */
export function toDb(value: MoneyInput): Prisma.Decimal {
  return round2(value);
}

/** Nullable variant of toDb. */
export function toDbOrNull(value: MoneyInput): Prisma.Decimal | null {
  if (value == null || value === '') return null;
  return round2(value);
}

/** Fixed 2dp string, e.g. "1234.50". */
export function toFixed2(value: MoneyInput): string {
  return round2(value).toFixed(MONEY_DP);
}

/**
 * Deep-convert every Prisma.Decimal inside a value to a 2dp JS number.
 * Plain objects and arrays are copied; Dates, Buffers and class instances other
 * than Decimal are returned as-is.
 */
export function serializeMoney<T>(value: T): T {
  return convert(value, new WeakMap()) as T;
}

function convert(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (isDecimal(value)) return toNumber(value);
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const v of value) out.push(convert(v, seen));
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = convert(v, seen);
  return out;
}
