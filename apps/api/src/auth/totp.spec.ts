import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, generate, verify, generateURI } from 'otplib';

test('otplib v13 TOTP: generate secret, create token, verify', async () => {
  const secret = generateSecret();
  const token = await generate({ secret });
  assert.equal((await verify({ secret, token, epochTolerance: 0 })).valid, true);
  const wrong = token === '000000' ? '111111' : '000000';
  assert.equal((await verify({ secret, token: wrong, epochTolerance: 0 })).valid, false);
  assert.match(generateURI({ issuer: 'EITF HRMS', label: 'a@b.c', secret }), /^otpauth:\/\/totp\//);
});
