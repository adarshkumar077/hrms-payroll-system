"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { badgeToneForTagColor } from "@/lib/tags";
import { addTagAction, removeTagAction } from "@/app/(app)/tags/actions";

export type TagChip = { linkId: string; tagId: string; name: string; color: string };
export type TenantTagOption = { id: string; name: string; color: string };

// Record-detail tag editor: renders the record's current tags as removable
// chips plus an "Add tag" input (datalist-suggested from every tag the
// tenant has ever created). Mirrors the useTransition + inline-error pattern
// of app/(app)/leads/LeadRowActions.tsx.
export function TagChips({
  module,
  recordId,
  tags,
  allTags,
}: {
  module: string;
  recordId: string;
  tags: TagChip[];
  allTags: TenantTagOption[];
}) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const datalistId = `tag-options-${module}-${recordId}`;

  function submit() {
    const name = value.trim();
    if (!name || pending) return;
    start(async () => {
      const res = await addTagAction(module, recordId, name);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setValue("");
      setError(null);
    });
  }

  function remove(linkId: string) {
    start(async () => {
      await removeTagAction(linkId);
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tags.map((t) => (
        <Badge key={t.linkId} tone={badgeToneForTagColor(t.color)}>
          <span className="inline-flex items-center gap-1">
            {t.name}
            <button
              type="button"
              className="leading-none opacity-60 hover:opacity-100"
              disabled={pending}
              onClick={() => remove(t.linkId)}
              aria-label={`Remove tag ${t.name}`}
            >
              ✕
            </button>
          </span>
        </Badge>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="inline-flex items-center gap-1"
      >
        <input
          list={datalistId}
          className="input py-1 text-xs w-28"
          placeholder="Add tag…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          maxLength={30}
        />
        <datalist id={datalistId}>
          {allTags.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
        <button type="submit" className="btn-ghost text-xs py-1" disabled={pending || !value.trim()}>
          {pending ? "…" : "+ Tag"}
        </button>
      </form>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
