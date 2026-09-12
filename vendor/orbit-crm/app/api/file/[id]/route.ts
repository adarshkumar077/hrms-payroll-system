import fs from "fs/promises";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAttachment, absolutePathFor } from "@/lib/storage";

// GET /api/file/[id] — streams the stored file bytes back with its mime type.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthenticated." }, { status: 401 });
  }

  const attachment = await getAttachment(params.id);
  if (!attachment || attachment.tenantId !== session.tenantId) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(absolutePathFor(attachment));
  } catch {
    return NextResponse.json({ ok: false, error: "File missing on disk." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": attachment.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Content-Length": String(attachment.size || data.byteLength),
    },
  });
}
