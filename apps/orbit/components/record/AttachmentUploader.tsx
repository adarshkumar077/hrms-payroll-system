"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Orbit Studio — record-page attachment uploader (Wave E).
 *
 * Small client child of AttachmentsPanel: posts straight to POST /api/upload
 * (multipart, fields: entity / entityId / file — see app/api/upload/route.ts)
 * then router.refresh()es so the server-rendered attachments list picks up
 * the new row. Mirrors app/(app)/documents/UploadWidget.tsx's mechanics,
 * minus the free-text entity input (entity/entityId are fixed by the caller).
 */
export function AttachmentUploader({ entity, entityId }: { entity: string; entityId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }

    const form = new FormData();
    form.set("entity", entity);
    form.set("entityId", entityId);
    form.set("file", file);

    startTransition(async () => {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
      if (!json.ok) {
        setError(json.error || "Upload failed.");
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2">
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" className="input flex-1 text-xs" disabled={isPending} />
        <button type="submit" className="btn text-xs shrink-0" disabled={isPending}>
          {isPending ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
    </form>
  );
}
