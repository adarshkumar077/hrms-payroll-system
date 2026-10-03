import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_ORIGIN = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');

/** Wait between proxy attempts while Nest --watch restarts (bounded, never infinite). */
const RETRY_DELAYS_MS = [0, 1200, 2500, 4000, 6000];

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  const suffix = path.map(encodeURIComponent).join('/');
  const target = `${API_ORIGIN}/api/v1/${suffix}${req.nextUrl.search}`;

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const bodyBuf = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (
      k === 'host' ||
      k === 'connection' ||
      k === 'content-length' ||
      k === 'transfer-encoding' ||
      k === 'keep-alive'
    ) {
      return;
    }
    headers.set(key, value);
  });

  let lastMessage = 'Backend is restarting or unreachable. Wait a few seconds, then refresh.';

  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
    try {
      const upstream = await fetch(target, {
        method,
        headers,
        body: bodyBuf,
        cache: 'no-store',
      });

      const outHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        const k = key.toLowerCase();
        if (k === 'transfer-encoding' || k === 'connection') return;
        outHeaders.set(key, value);
      });

      const payload = await upstream.arrayBuffer();
      return new NextResponse(payload, { status: upstream.status, headers: outHeaders });
    } catch (err) {
      lastMessage =
        err instanceof Error && /econnrefused|fetch failed|socket/i.test(err.message)
          ? 'Backend is restarting or unreachable. Wait a few seconds, then refresh.'
          : err instanceof Error
            ? err.message
            : lastMessage;
    }
  }

  return NextResponse.json({ message: lastMessage }, { status: 503 });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
