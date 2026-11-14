import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  buildSelfieKey,
  decodeSelfieDataUrl,
  detectImageMime,
  mapSelfieUrls,
  SELFIE_MAX_BYTES,
} from './selfie-storage';
import { sanitizeAttendanceRecord } from './attendance-privacy';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const du = (b: Buffer, mime = 'image/jpeg') => `data:${mime};base64,${b.toString('base64')}`;

describe('decodeSelfieDataUrl', () => {
  it('accepts jpeg, png, webp by magic bytes', () => {
    assert.equal(decodeSelfieDataUrl(du(JPEG)).mime, 'image/jpeg');
    assert.equal(decodeSelfieDataUrl(du(PNG, 'image/png')).mime, 'image/png');
    assert.equal(decodeSelfieDataUrl(du(WEBP, 'image/webp')).mime, 'image/webp');
    assert.equal(decodeSelfieDataUrl(du(JPEG)).buffer.equals(JPEG), true);
  });

  it('rejects bad magic bytes even with an image mime', () => {
    assert.throws(
      () => decodeSelfieDataUrl(du(Buffer.from('<svg onload=alert(1)>'), 'image/jpeg')),
      BadRequestException,
    );
    assert.equal(detectImageMime(Buffer.from('GIF89a....')), null);
  });

  it('rejects images over 2 MB after decode', () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(SELFIE_MAX_BYTES)]);
    assert.throws(() => decodeSelfieDataUrl(du(big)), /too large/);
  });

  it('accepts exactly the limit', () => {
    const ok = Buffer.concat([JPEG, Buffer.alloc(SELFIE_MAX_BYTES - JPEG.length)]);
    assert.equal(decodeSelfieDataUrl(du(ok)).buffer.length, SELFIE_MAX_BYTES);
  });

  it('rejects non-data-url and empty input', () => {
    assert.throws(() => decodeSelfieDataUrl('https://x/y.jpg'), BadRequestException);
    assert.throws(() => decodeSelfieDataUrl('data:image/jpeg;base64,'), BadRequestException);
  });
});

describe('buildSelfieKey', () => {
  it('follows selfies/<company>/<yyyy-mm>/<record>-<in|out>-<random>.jpg', () => {
    const k = buildSelfieKey({
      companyId: 'c1',
      recordId: 'r1',
      punchType: 'OUT',
      at: new Date('2026-03-09T10:00:00Z'),
    });
    assert.match(k, /^selfies\/c1\/2026-03\/r1-out-[0-9a-f]{16}\.jpg$/);
  });
});

describe('selfie URL mapping respects privacy', () => {
  const rec = {
    id: 'r1',
    status: 'P',
    selfieUrl: 'storage:selfies/c1/2026-03/r1-in-aa.jpg',
    checkInSelfieUrl: 'storage:selfies/c1/2026-03/r1-in-aa.jpg',
    checkOutSelfieUrl: 'data:image/jpeg;base64,legacy',
    punches: [{ id: 'p1', selfieUrl: 'storage:selfies/c1/2026-03/r1-out-bb.jpg' }],
  };
  const signed: string[] = [];
  const sign = async (key: string) => {
    signed.push(key);
    return `https://signed/${key}`;
  };

  it('non-privileged viewers get no selfie fields and nothing is signed', async () => {
    signed.length = 0;
    const out = (await mapSelfieUrls(sanitizeAttendanceRecord(rec, false), sign)) as Record<string, unknown>;
    assert.equal('selfieUrl' in out, false);
    assert.equal('checkInSelfieUrl' in out, false);
    assert.equal('checkOutSelfieUrl' in out, false);
    assert.equal(JSON.stringify(out).includes('storage:'), false);
    assert.deepEqual(signed, []);
  });

  it('privileged viewers get signed URLs; legacy data: passes through', async () => {
    signed.length = 0;
    const out = (await mapSelfieUrls(sanitizeAttendanceRecord(rec, true), sign)) as typeof rec;
    assert.equal(out.checkInSelfieUrl, 'https://signed/selfies/c1/2026-03/r1-in-aa.jpg');
    assert.equal(out.selfieUrl, 'https://signed/selfies/c1/2026-03/r1-in-aa.jpg');
    assert.equal(out.checkOutSelfieUrl, 'data:image/jpeg;base64,legacy');
    assert.equal(out.punches[0].selfieUrl, 'https://signed/selfies/c1/2026-03/r1-out-bb.jpg');
    assert.equal(rec.checkInSelfieUrl.startsWith('storage:'), true, 'input not mutated');
  });

  it('handles null/undefined records', async () => {
    assert.equal(await mapSelfieUrls(null, sign), null);
  });
});
