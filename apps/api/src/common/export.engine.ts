import ExcelJS from 'exceljs';

export type ExportFile = {
  filename: string;
  content: Buffer | string;
  contentType: string;
};

function slug(title: string) {
  return title.replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_\-]/g, '');
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

export function rowsToHtmlPdf(title: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title></head><body><h1>${title}</h1><p>No rows</p><script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`;
  }
  const keys = Object.keys(rows[0]);
  const head = keys.map((k) => `<th>${k}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${keys.map((k) => `<td>${r[k] == null ? '' : String(r[k])}</td>`).join('')}</tr>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Segoe UI,system-ui,sans-serif;padding:16px;color:#0c1a16}
h1{color:#1a6b54;font-size:18px;margin:0 0 8px}
.meta{font-size:11px;color:#666;margin-bottom:12px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:5px 7px;font-size:10px}
th{background:#e8f3ef;text-align:left}
tr:nth-child(even){background:#fafafa}
@media print{button{display:none}}
</style></head><body>
<h1>${title}</h1>
<p class="meta">EITF HRMS export · ${new Date().toISOString()} · ${rows.length} row(s)</p>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
}

export async function rowsToXlsx(title: string, rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EITF HRMS';
  wb.created = new Date();
  const sheet = wb.addWorksheet(title.slice(0, 28) || 'Sheet1');
  if (!rows.length) {
    sheet.addRow(['No data']);
  } else {
    const keys = Object.keys(rows[0]);
    sheet.addRow(keys);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FF1A6B54' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F3EF' },
    };
    for (const r of rows) {
      sheet.addRow(keys.map((k) => (r[k] == null ? '' : r[k])));
    }
    sheet.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = Math.min(40, len);
      });
      col.width = max + 2;
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildExport(
  format: 'csv' | 'excel' | 'pdf',
  title: string,
  rows: Record<string, unknown>[],
): Promise<ExportFile> {
  const base = slug(title) || 'export';
  if (format === 'csv') {
    return {
      filename: `${base}.csv`,
      content: rowsToCsv(rows),
      contentType: 'text/csv; charset=utf-8',
    };
  }
  if (format === 'excel') {
    const content = await rowsToXlsx(title, rows);
    return {
      filename: `${base}.xlsx`,
      content,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  return {
    filename: `${base}.html`,
    content: rowsToHtmlPdf(title, rows),
    contentType: 'text/html; charset=utf-8',
  };
}
