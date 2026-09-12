import { shortDate } from "@/lib/format";
import { AttachmentUploader } from "./AttachmentUploader";

/**
 * Orbit Studio — per-record attachments panel (Wave E).
 *
 * Server-component-friendly: caller fetches `listAttachments(tenantId,
 * entity, entityId)` (lib/storage.ts) alongside its other parallel fetches
 * and passes the rows in here. Lists filename / size / uploaded date with a
 * download link via GET /api/file/[id], plus an upload control (client
 * child — see AttachmentUploader) that posts to POST /api/upload and
 * router.refresh()es on success.
 *
 * `entity` must match the string already used for this record elsewhere
 * (EventLog.entity / Attachment.entity) — e.g. "Lead", "Opportunity",
 * "Account", "Ticket", "Contract" — so uploads land against the same rows
 * `listAttachments` queries for.
 */
export type AttachmentRow = {
  id: string;
  filename: string;
  size: number;
  createdAt: Date | string;
};

function formatSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  entity,
  entityId,
  attachments,
}: {
  entity: string;
  entityId: string;
  attachments: AttachmentRow[];
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-slate-800">Attachments</div>
        <span className="text-xs text-slate-400">{attachments.length}</span>
      </div>
      {attachments.length === 0 ? (
        <div className="text-sm text-slate-400">No attachments yet.</div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <a
                href={`/api/file/${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 hover:underline truncate"
              >
                {a.filename}
              </a>
              <span className="text-xs text-slate-400 shrink-0">
                {formatSize(a.size)} · {shortDate(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <AttachmentUploader entity={entity} entityId={entityId} />
    </div>
  );
}
