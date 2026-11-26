import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, rowsToCsv } from './export.engine';

describe('CSV export: formula (CSV) injection guard', () => {
  for (const hostile of ['=HYPERLINK("http://evil.example","x")', '+1+cmd', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) {
    test(`text starting with ${JSON.stringify(hostile[0])} is neutralised`, () => {
      const cell = csvCell(hostile);
      assert.ok(cell.startsWith("'") || cell.startsWith(`"'`), cell);
    });
  }
  test('normal text and numbers are unchanged', () => {
    assert.equal(csvCell('Asha Rao'), 'Asha Rao');
    assert.equal(csvCell(-1250.5), '-1250.5');
    assert.equal(csvCell(0), '0');
    assert.equal(csvCell(null), '');
  });
  test('quotes, commas and newlines are still escaped', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  });
  test('rowsToCsv applies the guard to every cell', () => {
    const csv = rowsToCsv([{ code: 'E1', name: '=HYPERLINK("x")', net: -5 }]);
    assert.equal(csv.split('\n')[1], `E1,"'=HYPERLINK(""x"")",-5`);
  });
});
