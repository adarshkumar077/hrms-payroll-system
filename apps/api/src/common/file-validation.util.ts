import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx']);

const BLOCKED_EXT = new Set([
  '.html',
  '.htm',
  '.svg',
  '.js',
  '.mjs',
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.php',
  '.asp',
  '.aspx',
]);

const MAGIC: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function detectMime(buffer: Buffer): string | null {
  for (const sig of MAGIC) {
    if (sig.bytes.every((b, i) => buffer[i] === b)) return sig.mime;
  }
  return null;
}

export function assertSafeUpload(file: Express.Multer.File, maxBytes = 15 * 1024 * 1024) {
  if (!file?.buffer?.length) throw new BadRequestException('File is required');
  if (file.size > maxBytes) throw new BadRequestException('File exceeds maximum allowed size');

  const ext = extOf(file.originalname || '');
  if (!ext || BLOCKED_EXT.has(ext)) throw new BadRequestException('File type not allowed');
  if (!ALLOWED_EXT.has(ext)) throw new BadRequestException('File type not allowed');

  const declared = (file.mimetype || '').toLowerCase();
  if (declared && !ALLOWED_MIME.has(declared)) {
    throw new BadRequestException('File type not allowed');
  }

  const detected = detectMime(file.buffer);
  if (detected && !ALLOWED_MIME.has(detected)) {
    throw new BadRequestException('File content does not match allowed types');
  }
  if (detected && declared && detected !== declared && !declared.includes('officedocument')) {
    throw new BadRequestException('File content type mismatch');
  }
}
