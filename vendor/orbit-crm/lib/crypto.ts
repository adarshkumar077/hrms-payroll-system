import crypto from "crypto";

// Encryption-at-rest + hashing for sensitive fields (GAPS #4).
// Key is derived from AUTH_SECRET, so rotating AUTH_SECRET invalidates stored secrets by design.
// decrypt() is back-compatible: values without the "v1:" prefix are returned as-is (legacy plaintext),
// so existing rows keep working until they're re-written encrypted.

function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set — cannot encrypt/decrypt secrets.");
  return crypto.createHash("sha256").update(s).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "v1:" + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string | null | undefined): string {
  if (!payload) return "";
  if (!payload.startsWith("v1:")) return payload; // legacy plaintext — back-compat
  const raw = Buffer.from(payload.slice(3), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** One-way hash for tokens (reset/invite) and recovery codes stored in the DB. */
export function hashToken(s: string): string {
  return crypto.createHash("sha256").update(s.trim()).digest("hex");
}
