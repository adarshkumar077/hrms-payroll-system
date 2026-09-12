import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Health check for container orchestrators / load balancers.
// GET /api/health -> { status: "ok", db: boolean }
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let dbOk = false;
  try {
    // Trivial round-trip to confirm the DB connection is live.
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json(
    { status: "ok", db: dbOk },
    { status: dbOk ? 200 : 503 }
  );
}
