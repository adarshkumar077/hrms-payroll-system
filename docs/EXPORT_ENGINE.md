# PDF & Excel Export Engine

Shared helper: `apps/api/src/common/export.engine.ts`

| Format | Output | Content-Type |
|---|---|---|
| CSV | UTF-8 CSV | `text/csv` |
| Excel | Real **.xlsx** via ExcelJS | OOXML spreadsheet |
| PDF | Print-optimized HTML (browser Print → PDF) | `text/html` |

## Used by

- Reports & balance sheets: `/reports/:kind/export/{csv|excel|pdf}`
- Security audit / compliance CSV endpoints (CSV path)
- Web Reports Center download buttons

## Extending

```ts
import { buildExport } from '../common/export.engine';
const file = await buildExport('excel', 'My Title', rows);
```
