/**
 * Small, dependency-free XML building/parsing helpers.
 *
 * Deliberately not a general-purpose XML library: Tally's HTTP/XML dialect is
 * flat and predictable (no mixed content, no namespaced attributes we care
 * about, no CDATA in the fields we read), so a couple of regex-based
 * tag readers are enough and keep this package's dependency count at zero.
 */

/** Escapes the five predefined XML entities for safe use inside element text. */
export function escapeXml(value: string | number): string {
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Reverses {@link escapeXml} plus numeric character references. */
export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

/** Builds `<name>escaped(value)</name>`. */
export function textTag(name: string, value: string | number): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

/** Builds `<name attr="v">content</name>` with the given raw (already-serialized) content. */
export function tag(name: string, content: string, attrs: Record<string, string> = {}): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
  return `<${name}${attrStr}>${content}</${name}>`;
}

/**
 * Returns the entity-decoded inner text of the first `<tagName>...</tagName>`
 * match, or undefined if the tag isn't present. Case-insensitive (Tally is
 * inconsistent about casing across versions).
 */
export function extractTag(xml: string, tagName: string): string | undefined {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "i");
  const m = xml.match(re);
  return m ? unescapeXml(m[1].trim()) : undefined;
}

/**
 * Returns the raw (still entity-encoded) inner XML of every top-level
 * occurrence of `<tagName>...</tagName>` — used to split a collection
 * response into per-record blocks before extracting fields from each.
 */
export function extractBlocks(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "gi");
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

/** True if `<tagName ...>` appears anywhere in the document (open tag only, ignores content). */
export function hasTag(xml: string, tagName: string): boolean {
  return new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "i").test(xml);
}
