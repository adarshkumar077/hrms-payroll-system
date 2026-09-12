import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { UploadWidget } from "./UploadWidget";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

function formatSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage() {
  const s = await requireSession();
  if (!(await can(s, "documents", "read"))) return <NoAccess label="Documents" />;

  const attachments = await db.attachment.findMany({
    where: { tenantId: s.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Documents" subtitle="Upload and retrieve files stored against this tenant." />

      <div className="mb-6">
        <UploadWidget />
      </div>

      {attachments.length === 0 ? (
        <Empty>No documents uploaded yet.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Filename</th>
                <th className="th">Entity</th>
                <th className="th">Size</th>
                <th className="th">Uploaded</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium text-slate-800">{a.filename}</td>
                  <td className="td">
                    <Badge tone="slate">{a.entity}</Badge>
                  </td>
                  <td className="td text-slate-600">{formatSize(a.size)}</td>
                  <td className="td text-slate-600">{shortDate(a.createdAt)}</td>
                  <td className="td text-right">
                    <a href={`/api/file/${a.id}`} className="btn-ghost text-xs" target="_blank" rel="noopener noreferrer">
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
