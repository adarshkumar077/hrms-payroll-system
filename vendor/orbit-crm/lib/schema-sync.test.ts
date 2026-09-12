import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// GAPS #2: schema.prisma (SQLite) and schema.postgres.prisma (Postgres) are hand-synced.
// This test proves the model bodies never drift — it does NOT touch a database, it just
// diffs the two schema files as text. Fails loudly (naming the first differing model)
// if anyone edits one schema and forgets the other.

const SQLITE_SCHEMA = path.resolve(__dirname, "../prisma/schema.prisma");
const POSTGRES_SCHEMA = path.resolve(__dirname, "../prisma/schema.postgres.prisma");

// Pull out every `model Name { ... }` block using a balanced-brace scan (NOT a naive
// non-greedy regex up to the next `}`): some models' doc comments contain literal JSON
// braces (e.g. Role's `// JSON: { "leads": [...], "_fields": {"...":"hidden"} }`) and
// `@default("{}")` string literals also contain a `{}` pair. A non-greedy regex would
// stop at one of those inner braces instead of the model's real closing brace, so we
// track depth ourselves and skip over `//` comments and `"..."` string literals.
function extractModels(source: string): Map<string, string> {
  const models = new Map<string, string>();
  const headerRe = /model\s+(\w+)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(source))) {
    const name = match[1];
    const bodyStart = headerRe.lastIndex; // index just after the opening `{`
    const { body, endIndex } = readBalancedBody(source, bodyStart);
    models.set(name, normalizeBody(body));
    headerRe.lastIndex = endIndex; // resume scanning after this model's closing `}`
  }
  return models;
}

// Starting just past a model's opening `{` (so depth already = 1), scan forward
// until depth returns to 0, ignoring braces that appear inside `//` line comments
// or `"..."` string literals. Returns the raw body text and the index right after
// the matching closing `}`.
function readBalancedBody(source: string, start: number): { body: string; endIndex: number } {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < source.length && source[i] !== '"') {
        i += source[i] === "\\" ? 2 : 1;
      }
      i++; // consume closing quote
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return { body: source.slice(start, i - 1), endIndex: i };
}

// Strip `//` line comments and blank/whitespace-only lines, trim each remaining
// line, and collapse internal runs of spaces/tabs to one space — so formatting
// differences (prisma-format column alignment differs per file since it's keyed
// off the longest field name/type in that file) and comment differences between
// the two files don't cause false positives, while any real field/attribute
// difference still shows up.
function normalizeBody(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const commentIdx = line.indexOf("//");
      const stripped = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
      return stripped.trim().replace(/\s+/g, " ");
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

describe("schema-sync (GAPS #2)", () => {
  it("keeps prisma/schema.prisma and prisma/schema.postgres.prisma model bodies identical", () => {
    const sqliteSource = fs.readFileSync(SQLITE_SCHEMA, "utf-8");
    const postgresSource = fs.readFileSync(POSTGRES_SCHEMA, "utf-8");

    const sqliteModels = extractModels(sqliteSource);
    const postgresModels = extractModels(postgresSource);

    expect(sqliteModels.size).toBeGreaterThan(0);
    expect(postgresModels.size).toBeGreaterThan(0);

    const sqliteNames = new Set(sqliteModels.keys());
    const postgresNames = new Set(postgresModels.keys());

    const onlyInSqlite = [...sqliteNames].filter((n) => !postgresNames.has(n));
    const onlyInPostgres = [...postgresNames].filter((n) => !sqliteNames.has(n));

    expect(
      onlyInSqlite,
      `Model(s) present in schema.prisma but missing from schema.postgres.prisma: ${onlyInSqlite.join(", ")}`
    ).toEqual([]);
    expect(
      onlyInPostgres,
      `Model(s) present in schema.postgres.prisma but missing from schema.prisma: ${onlyInPostgres.join(", ")}`
    ).toEqual([]);

    // Compare in the schema's declaration order so the FIRST differing model reported
    // is the first one that appears in the file, not an arbitrary Map-iteration order.
    for (const name of sqliteNames) {
      const sqliteBody = sqliteModels.get(name)!;
      const postgresBody = postgresModels.get(name)!;
      expect(
        postgresBody,
        `model ${name} differs between prisma/schema.prisma and prisma/schema.postgres.prisma.\n\n` +
          `--- schema.prisma::${name} ---\n${sqliteBody}\n\n` +
          `--- schema.postgres.prisma::${name} ---\n${postgresBody}\n`
      ).toBe(sqliteBody);
    }
  });
});
