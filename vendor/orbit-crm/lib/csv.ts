// Dependency-free CSV helpers. Handles quoted fields (with embedded commas, quotes,
// and newlines) and both CRLF / LF line endings.

/** Parse CSV text into a header row + array of row objects keyed by header. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const table = parseRows(text);
  if (table.length === 0) return { headers: [], rows: [] };

  const headers = table[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    // Skip fully blank rows (common trailing newline artifact).
    if (line.length === 1 && line[0].trim() === "") continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = line[idx] !== undefined ? line[idx] : "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

/** Tokenize raw CSV text into rows of raw string fields, respecting RFC4180-style quoting. */
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize CRLF -> LF up front is unsafe inside quoted fields containing literal \r\n
  // we want to preserve, so we scan character-by-character instead.
  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }

    if (ch === "\r") {
      // Treat \r\n or lone \r as a line break.
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      if (text[i] === "\n") i++;
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush the last field/row if there's trailing content.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop a fully empty trailing row (e.g. file ends with a newline).
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }

  return rows;
}

/** Escape a single CSV field: quote it if it contains a comma, quote, or newline. */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize an array of plain objects into CSV text (header row = union of keys, in first-row order). */
export function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";

  const headerSet = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((k) => headerSet.add(k));
  }
  const headers = Array.from(headerSet);

  const lines = [headers.map(escapeField).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeField(row[h])).join(","));
  }
  return lines.join("\r\n");
}
