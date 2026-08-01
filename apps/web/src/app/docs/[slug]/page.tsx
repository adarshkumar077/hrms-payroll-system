import { readFile } from 'fs/promises';
import path from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const MAP: Record<string, { file: string; title: string }> = {
  'user-manuals': { file: 'USER_MANUALS.md', title: 'User manuals' },
  training: { file: 'TRAINING.md', title: 'Training' },
  deployment: { file: 'DEPLOYMENT.md', title: 'Deployment' },
  backup: { file: 'BACKUP_AND_RECOVERY.md', title: 'Backup & recovery' },
  security: { file: 'AUDIT_AND_SECURITY.md', title: 'Audit & security' },
  database: { file: 'DATABASE.md', title: 'Database' },
  exports: { file: 'EXPORT_ENGINE.md', title: 'Export engine' },
};

async function loadDoc(file: string) {
  const candidates = [
    path.join(process.cwd(), 'docs', file),
    path.join(process.cwd(), '..', '..', 'docs', file),
    path.join(process.cwd(), '..', 'docs', file),
  ];
  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8');
    } catch {
      /* try next */
    }
  }
  return null;
}

export default async function DocSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meta = MAP[slug];
  if (!meta) notFound();
  const body = (await loadDoc(meta.file)) ?? `# ${meta.title}\n\nMissing docs/${meta.file}`;
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/help" className="text-sm text-brand-600 hover:underline">
        ← Help
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">{meta.title}</h1>
      <pre className="mt-4 whitespace-pre-wrap text-sm font-sans text-ink bg-white/80 border border-brand-100 rounded-lg p-4 overflow-x-auto">
        {body}
      </pre>
    </main>
  );
}
