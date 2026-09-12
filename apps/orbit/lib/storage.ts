import fs from "fs/promises";
import path from "path";
import { db } from "./db";

// Local-filesystem document storage.
//
// Files are written under `data/uploads/<tenantId>/` at the repo root, and an
// `Attachment` row is created pointing at them (via `/api/file/<id>`, which
// streams the bytes back with tenant-scoped auth).
//
// NOTE: this is dev/VPS-only — a serverless host (Vercel, etc.) has no
// persistent local disk, so a production deployment on serverless infra must
// swap this module for an S3 (or equivalent object-storage) backed
// implementation. Keep the exported function signatures the same so callers
// (app/api/upload, app/(app)/documents) don't need to change.
//
// The seam is intentionally just two functions: `saveFile` (write bytes, create
// the Attachment row) and `getAttachment` (look up the row so a route can stream
// bytes back). An S3 driver would implement the same two signatures — swapping
// `fs.writeFile`/`fs.mkdir` for an S3 `PutObject` call and pointing
// `absolutePathFor`/the streaming route at a signed URL or `GetObject` instead of
// the local path — with no changes needed at any call site.

const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");

export type StoredFileInput = {
  name: string;
  type: string;
  size: number;
  bytes: Buffer | Uint8Array;
};

/** Sanitize a filename for safe on-disk storage (keep it human-readable, strip path segments). */
function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "file";
}

/**
 * Save an uploaded file to local disk under data/uploads/<tenantId>/ and
 * record it as an Attachment against the given entity/entityId.
 */
export async function saveFile(
  tenantId: string,
  entity: string,
  entityId: string,
  file: StoredFileInput,
  uploadedById?: string
) {
  const tenantDir = path.join(UPLOAD_ROOT, tenantId);
  await fs.mkdir(tenantDir, { recursive: true });

  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const storedName = `${stamp}-${rand}-${safeFilename(file.name)}`;
  const diskPath = path.join(tenantDir, storedName);

  await fs.writeFile(diskPath, file.bytes);

  // Store the path relative to the upload root — the /api/file/[id] route
  // resolves it back to an absolute path using the Attachment's tenantId.
  const relativeUrl = path.posix.join(tenantId, storedName);

  const attachment = await db.attachment.create({
    data: {
      tenantId,
      entity,
      entityId,
      filename: file.name,
      url: relativeUrl,
      mime: file.type || null,
      size: file.size || 0,
      uploadedById,
    },
  });

  return attachment;
}

/** List attachments for a given entity, most recent first. */
export async function listAttachments(tenantId: string, entity: string, entityId: string) {
  return db.attachment.findMany({
    where: { tenantId, entity, entityId },
    orderBy: { createdAt: "desc" },
  });
}

/** Fetch a single attachment by id (no tenant filter — callers must check tenantId themselves). */
export async function getAttachment(id: string) {
  return db.attachment.findUnique({ where: { id } });
}

/** Resolve an Attachment's stored relative url to an absolute path on disk. */
export function absolutePathFor(attachment: { url: string }): string {
  return path.join(UPLOAD_ROOT, attachment.url);
}
