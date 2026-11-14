import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import path from 'path';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type StorageDriver = 'local' | 's3';

/** Object storage with two drivers: `local` disk (default) and `s3` (S3/R2/B2 compatible). */
@Injectable()
export class StorageService implements OnModuleInit {
  private rootDir!: string;
  private s3Client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.rootDir = this.config.get('LOCAL_STORAGE_DIR') ?? path.join(process.cwd(), 'uploads');
    if (!existsSync(this.rootDir)) {
      mkdirSync(this.rootDir, { recursive: true });
    }
  }

  get driver(): StorageDriver {
    return String(this.config.get('STORAGE_DRIVER') ?? 'local').toLowerCase() === 's3'
      ? 's3'
      : 'local';
  }

  /** @deprecated use `driver` */
  get provider() {
    return this.driver;
  }

  // ── generic API ────────────────────────────────────────────────────────────

  /** Store an object under an exact key with the configured driver. */
  async put(key: string, buffer: Buffer, contentType: string) {
    if (this.driver === 's3') {
      await this.s3().send(
        new PutObjectCommand({
          Bucket: this.bucket(),
          Key: this.cleanKey(key),
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } else {
      const full = this.safePath(key);
      mkdirSync(path.dirname(full), { recursive: true });
      await writeFile(full, buffer);
    }
    return { storageKey: key, storageProvider: this.driver };
  }

  /**
   * Read stream for a key. `provider` is the driver recorded on the row at write time
   * (so legacy local files stay readable after switching to s3); defaults to the active driver.
   */
  async getStream(key: string, provider?: string | null): Promise<Readable> {
    if ((provider ?? this.driver) === 's3') {
      const out = await this.s3().send(
        new GetObjectCommand({ Bucket: this.bucket(), Key: this.cleanKey(key) }),
      );
      if (!out.Body) throw new Error('File not found in storage');
      return out.Body as Readable;
    }
    const full = this.safePath(key);
    if (!existsSync(full)) throw new Error('File not found on disk');
    return createReadStream(full);
  }

  async delete(key: string, provider?: string | null) {
    if ((provider ?? this.driver) === 's3') {
      await this.s3().send(
        new DeleteObjectCommand({ Bucket: this.bucket(), Key: this.cleanKey(key) }),
      );
      return;
    }
    const full = this.safePath(key);
    if (existsSync(full)) await unlink(full);
  }

  /** Time-limited URL: s3 presigned GET, or HMAC-signed API URL for the local driver. */
  async signedUrl(key: string, ttlSeconds = 300): Promise<string> {
    if (this.driver === 's3') {
      return getSignedUrl(
        this.s3(),
        new GetObjectCommand({ Bucket: this.bucket(), Key: this.cleanKey(key) }),
        { expiresIn: ttlSeconds },
      );
    }
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = this.sign(key, exp);
    const base = (this.config.get<string>('API_PUBLIC_URL') ?? '').replace(/\/+$/, '');
    const prefix = String(this.config.get<string>('API_PREFIX') ?? 'api/v1').replace(
      /^\/+|\/+$/g,
      '',
    );
    return `${base}/${prefix}/storage/object?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`;
  }

  /** Verify a local-driver signed URL. Constant-time compare; rejects expired. */
  verifySignature(key: string, exp: number, sig: string, nowMs = Date.now()): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
    const expected = Buffer.from(this.sign(key, exp), 'hex');
    const given = Buffer.from(String(sig), 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  // ── document API (signatures unchanged; now driver-aware) ──────────────────

  async saveLocal(companyId: string, employeeId: string, fileName: string, buffer: Buffer) {
    return this.save(companyId, employeeId, fileName, buffer);
  }

  async save(
    companyId: string,
    folder: string,
    fileName: string,
    buffer: Buffer,
    contentType = 'application/octet-stream',
  ) {
    const key = `${companyId}/${folder}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const r = await this.put(key, buffer, contentType);
    return { storageKey: r.storageKey, storageProvider: r.storageProvider };
  }

  absolutePath(storageKey: string) {
    return this.safePath(storageKey);
  }

  /** @deprecated use delete() */
  deleteLocal(storageKey: string) {
    return this.delete(storageKey, 'local');
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private sign(key: string, exp: number) {
    return createHmac('sha256', this.signingSecret()).update(`${key}\n${exp}`).digest('hex');
  }

  private signingSecret() {
    const s =
      this.config.get<string>('STORAGE_SIGNING_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET');
    if (!s) throw new Error('STORAGE_SIGNING_SECRET (or JWT_ACCESS_SECRET) is required');
    return `storage-url:${s}`;
  }

  private bucket() {
    const b = this.config.get<string>('S3_BUCKET');
    if (!b) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
    return b;
  }

  private s3() {
    if (!this.s3Client) {
      const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
      const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
      this.s3Client = new S3Client({
        region: this.config.get<string>('S3_REGION') ?? 'auto',
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle: String(this.config.get('S3_FORCE_PATH_STYLE') ?? '') === 'true',
        credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      });
    }
    return this.s3Client;
  }

  private cleanKey(key: string) {
    const k = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!k || k.includes('..')) throw new Error('Invalid storage key');
    return k;
  }

  private safePath(storageKey: string) {
    const normalized = this.cleanKey(storageKey);
    const full = path.resolve(this.rootDir, normalized);
    const root = path.resolve(this.rootDir);
    if (!full.startsWith(root + path.sep) && full !== root) {
      throw new Error('Invalid storage key');
    }
    return full;
  }
}
