import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveFile } from "@/lib/storage";
import { rateLimit, clientKey } from "@/lib/ratelimit";

// POST /api/upload  (multipart/form-data)
// Fields: entity (string), entityId (string), file (File)
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

export async function POST(req: Request) {
  const { ok: withinLimit, retryAfter } = rateLimit(`upload:${clientKey(req)}`, 20, 60_000); // 20/min
  if (!withinLimit) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads. Please slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthenticated." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid multipart form data." }, { status: 400 });
  }

  const entity = form.get("entity");
  const entityId = form.get("entityId");
  const file = form.get("file");

  if (typeof entity !== "string" || !entity.trim()) {
    return NextResponse.json({ ok: false, error: "Missing 'entity' field." }, { status: 400 });
  }
  if (typeof entityId !== "string" || !entityId.trim()) {
    return NextResponse.json({ ok: false, error: "Missing 'entityId' field." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing 'file' field." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File too large — max size is 10 MB." },
      { status: 400 }
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported file type — only PNG, JPEG, WEBP images or PDF are allowed.",
      },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  try {
    const attachment = await saveFile(
      session.tenantId,
      entity.trim(),
      entityId.trim(),
      { name: file.name, type: file.type, size: file.size, bytes },
      session.userId
    );
    return NextResponse.json({ ok: true, attachment });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to save file." },
      { status: 500 }
    );
  }
}
