import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

const dir = mkdtempSync(path.join(os.tmpdir(), 'eitf-storage-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function make(extra: Record<string, unknown> = {}) {
  const cfg = new ConfigService({
    LOCAL_STORAGE_DIR: dir,
    JWT_ACCESS_SECRET: 'test-secret',
    ...extra,
  });
  const svc = new StorageService(cfg);
  svc.onModuleInit();
  return svc;
}

async function readAll(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

describe('StorageService (local driver)', () => {
  it('defaults to local and round-trips put/get/delete', async () => {
    const s = make();
    assert.equal(s.driver, 'local');
    await s.put('selfies/c1/2026-01/r1-in-abc.jpg', Buffer.from('hello'), 'image/jpeg');
    const out = await readAll(await s.getStream('selfies/c1/2026-01/r1-in-abc.jpg'));
    assert.equal(out.toString(), 'hello');
    await s.delete('selfies/c1/2026-01/r1-in-abc.jpg');
    await assert.rejects(() => s.getStream('selfies/c1/2026-01/r1-in-abc.jpg'));
  });

  it('rejects path traversal keys', async () => {
    const s = make();
    await assert.rejects(() => s.put('../evil.txt', Buffer.from('x'), 'text/plain'));
  });

  it('signed URL verifies when valid', async () => {
    const s = make({ API_PUBLIC_URL: 'https://api.example.com/' });
    const url = new URL(await s.signedUrl('selfies/c1/2026-01/r1-in-abc.jpg', 60));
    assert.equal(url.origin, 'https://api.example.com');
    assert.equal(url.pathname, '/api/v1/storage/object');
    const key = url.searchParams.get('key')!;
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    assert.equal(s.verifySignature(key, exp, sig), true);
  });

  it('rejects expired signatures', async () => {
    const s = make();
    const url = new URL(`http://x${(await s.signedUrl('selfies/c1/2026-01/a.jpg', 1)).replace(/^https?:\/\/[^/]+/, '')}`);
    const key = url.searchParams.get('key')!;
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    assert.equal(s.verifySignature(key, exp, sig, (exp + 5) * 1000), false);
  });

  it('rejects tampered key, exp or sig', async () => {
    const s = make();
    const url = new URL(`http://x${await s.signedUrl('selfies/c1/2026-01/a.jpg', 60)}`);
    const key = url.searchParams.get('key')!;
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig')!;
    assert.equal(s.verifySignature('selfies/c2/2026-01/a.jpg', exp, sig), false);
    assert.equal(s.verifySignature(key, exp + 1000, sig), false);
    assert.equal(s.verifySignature(key, exp, sig.slice(0, -2) + '00'), false);
    assert.equal(s.verifySignature(key, exp, 'zz'), false);
    assert.equal(s.verifySignature(key, exp, ''), false);
  });

  it('signatures differ across secrets', async () => {
    const a = make();
    const b = make({ STORAGE_SIGNING_SECRET: 'other' });
    const url = new URL(`http://x${await a.signedUrl('selfies/c1/2026-01/a.jpg', 60)}`);
    assert.equal(
      b.verifySignature(
        url.searchParams.get('key')!,
        Number(url.searchParams.get('exp')),
        url.searchParams.get('sig')!,
      ),
      false,
    );
  });
});

describe('StorageService (s3 driver)', () => {
  it('selects s3 and produces a presigned URL without network access', async () => {
    const s = make({
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'eitf',
      S3_ACCESS_KEY_ID: 'AKIATEST',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'true',
    });
    assert.equal(s.driver, 's3');
    const url = await s.signedUrl('selfies/c1/2026-01/a.jpg', 120);
    assert.match(url, /^https:\/\/acct\.r2\.cloudflarestorage\.com\/eitf\/selfies\/c1\/2026-01\/a\.jpg\?/);
    assert.match(url, /X-Amz-Expires=120/);
  });
});
