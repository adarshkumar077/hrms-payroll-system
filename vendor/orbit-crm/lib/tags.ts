// Pure server helpers for the cross-module Tags feature (Tag + TagLink, see
// prisma/schema.prisma). No "use server" here — these are plain read helpers
// called from RSC pages; mutations live in app/(app)/tags/actions.ts.
import { db } from "./db";

// Badge tone names this cycles through (components/ui.tsx `Badge`'s `tone`
// prop only understands these six). Tag.color's schema default ("gray")
// isn't one of them — badgeToneForTagColor() below aliases it to "slate"
// wherever a tag color is rendered.
export const TAG_COLOR_CYCLE = ["blue", "green", "amber", "red", "brand", "slate"] as const;
export type TagColor = (typeof TAG_COLOR_CYCLE)[number];

/** Deterministic color-cycle: the Nth tag a tenant creates gets TAG_COLOR_CYCLE[N % length]. */
export function nextTagColor(existingCount: number): TagColor {
  const idx = ((existingCount % TAG_COLOR_CYCLE.length) + TAG_COLOR_CYCLE.length) % TAG_COLOR_CYCLE.length;
  return TAG_COLOR_CYCLE[idx];
}

/** Maps a stored Tag.color to a valid components/ui.tsx Badge tone. */
export function badgeToneForTagColor(color: string): string {
  return color === "gray" ? "slate" : color;
}

const MAX_TAG_NAME_LEN = 30;

/** Same normalization addTagAction uses to find-or-create a Tag — exported so callers can match it. */
export function normalizeTagName(raw: string): string {
  return raw.trim().toLowerCase().slice(0, MAX_TAG_NAME_LEN);
}

export type TagWithLink = { linkId: string; tagId: string; name: string; color: string };

/** Tags attached to one record, joined TagLink → Tag, oldest-applied first. */
export async function getTagsFor(tenantId: string, module: string, recordId: string): Promise<TagWithLink[]> {
  const links = await db.tagLink.findMany({
    where: { tenantId, module, recordId },
    orderBy: { createdAt: "asc" },
  });
  if (links.length === 0) return [];

  const tags = await db.tag.findMany({ where: { tenantId, id: { in: links.map((l) => l.tagId) } } });
  const byId = new Map(tags.map((t) => [t.id, t]));

  const out: TagWithLink[] = [];
  for (const l of links) {
    const tag = byId.get(l.tagId);
    if (tag) out.push({ linkId: l.id, tagId: tag.id, name: tag.name, color: tag.color });
  }
  return out;
}

/** Every tag defined for a tenant (for the "Add tag" datalist), alphabetical. */
export async function getTenantTags(tenantId: string) {
  return db.tag.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
}

/** Record ids in `module` that carry a tag named `tagName` (case-insensitive match on the stored lowercase name). */
export async function recordIdsWithTag(tenantId: string, module: string, tagName: string): Promise<string[]> {
  const name = normalizeTagName(tagName);
  if (!name) return [];

  const tag = await db.tag.findFirst({ where: { tenantId, name } });
  if (!tag) return [];

  const links = await db.tagLink.findMany({
    where: { tenantId, module, tagId: tag.id },
    select: { recordId: true },
  });
  return links.map((l) => l.recordId);
}
