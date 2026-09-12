"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function UploadWidget() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [entity, setEntity] = useState("General");
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
    form.set("entity", entity.trim() || "General");
    form.set("entityId", "manual"); // free-text upload not tied to a specific record
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
    <form onSubmit={handleSubmit} className="card p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Entity tag</label>
        <input
          className="input"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          placeholder="General"
        />
      </div>
      <div>
        <label className="label">File</label>
        <input ref={fileRef} type="file" className="input" />
      </div>
      <button type="submit" className="btn" disabled={isPending}>
        {isPending ? "Uploading…" : "Upload"}
      </button>
      {error && <span className="text-sm text-rose-600">{error}</span>}
    </form>
  );
}
