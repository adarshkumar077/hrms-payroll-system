import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

export const SELFIE_MAX_BYTES = 2 * 1024 * 1024;
export const SELFIE_KEY_PREFIX = 'storage:';
export const SELFIE_URL_TTL_SECONDS = 300;

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

export type SelfieMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function isDataImageUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image');
}

export function isStorageRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(SELFIE_KEY_PREFIX);
}

export function selfieKeyFromRef(ref: string) {
  return ref.slice(SELFIE_KEY_PREFIX.length);
}

/** Detect image type from magic bytes (jpeg / png / webp only). */
export function detectImageMime(buf: Buffer): SelfieMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Decode and validate a base64 image data URL. Throws BadRequestException on any problem. */
export function decodeSelfieDataUrl(dataUrl: string): { buffer: Buffer; mime: SelfieMime } {
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) throw new BadRequestException('Selfie must be a base64 image data URL');
  // Cheap size guard before decoding (base64 expands by 4/3).
  if (m[2].length > Math.ceil((SELFIE_MAX_BYTES * 4) / 3) + 16) {
    throw new BadRequestException('Selfie image is too large (max 2 MB)');
  }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0) throw new BadRequestException('Selfie image is empty');
  if (buffer.length > SELFIE_MAX_BYTES) {
    throw new BadRequestException('Selfie image is too large (max 2 MB)');
  }
  const mime = detectImageMime(buffer);
  if (!mime) throw new BadRequestException('Selfie must be a JPEG, PNG or WebP image');
  return { buffer, mime };
}

const EXT: Record<SelfieMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** `selfies/<companyId>/<yyyy-mm>/<recordId>-<in|out>-<random>.jpg` (png/webp keep their own ext). */
export function buildSelfieKey(opts: {
  companyId: string;
  recordId: string;
  punchType: 'IN' | 'OUT';
  at: Date;
  mime?: SelfieMime;
}) {
  const yyyy = opts.at.getUTCFullYear();
  const mm = String(opts.at.getUTCMonth() + 1).padStart(2, '0');
  const dir = opts.punchType === 'IN' ? 'in' : 'out';
  const ext = EXT[opts.mime ?? 'image/jpeg'];
  return `selfies/${opts.companyId}/${yyyy}-${mm}/${opts.recordId}-${dir}-${randomBytes(8).toString('hex')}.${ext}`;
}

export const SELFIE_FIELDS = ['selfieUrl', 'checkInSelfieUrl', 'checkOutSelfieUrl'] as const;

/**
 * Replace `storage:<key>` values on an (already privacy-sanitized) record / punches with signed
 * URLs. Fields stripped by sanitizeAttendanceRecord are absent, so nothing is signed for them.
 * `data:` and other values pass through unchanged.
 */
export async function mapSelfieUrls<T>(
  record: T,
  sign: (key: string) => Promise<string>,
): Promise<T> {
  if (!record || typeof record !== 'object') return record;
  const out = { ...(record as Record<string, unknown>) };
  for (const f of SELFIE_FIELDS) {
    const v = out[f];
    if (isStorageRef(v)) out[f] = await sign(selfieKeyFromRef(v));
  }
  if (Array.isArray(out.punches)) {
    out.punches = await Promise.all(
      out.punches.map((p) => (p && typeof p === 'object' ? mapSelfieUrls(p, sign) : p)),
    );
  }
  return out as T;
}
