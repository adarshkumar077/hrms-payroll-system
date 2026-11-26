import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskMobile, normalizeIndianMobile } from './mobile.util';

describe('normalizeIndianMobile', () => {
  for (const input of ['9876543210', '+919876543210', '919876543210', '09876543210', '+91 98765-43210', ' 98765 43210 ']) {
    test(`accepts ${JSON.stringify(input)}`, () => {
      assert.equal(normalizeIndianMobile(input), '9876543210');
    });
  }
  for (const input of ['', '12345', '5876543210', '98765432100', '+1 9876543210', '98765abcde', null, 9876543210]) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      assert.equal(normalizeIndianMobile(input as unknown), null);
    });
  }
});

test('maskMobile never shows more than the last 4 digits', () => {
  assert.equal(maskMobile('9876543210'), '******3210');
  assert.equal(maskMobile(null), '******');
});
