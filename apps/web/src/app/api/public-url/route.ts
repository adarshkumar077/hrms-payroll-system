import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

/** Serves the live Cloudflare quick-tunnel URL for LAN GPS fallback (no secrets). */
export async function GET() {
  try {
    const file = path.join(process.cwd(), '..', '.public-url.txt');
    const alt = path.join(process.cwd(), '.public-url.txt');
    const rootAlt = path.join(process.cwd(), '..', '..', '.public-url.txt');
    let raw = '';
    for (const candidate of [file, alt, rootAlt]) {
      try {
        raw = await readFile(candidate, 'utf8');
        if (raw.trim()) break;
      } catch {
        /* try next */
      }
    }
    const url = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.startsWith('https://'));
    if (!url) return NextResponse.json({ url: null }, { status: 404 });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ url: null }, { status: 404 });
  }
}
