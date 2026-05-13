/**
 * Toggle paid status for a user. Admin-only.
 * POST { userId, hasPaid: boolean }
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { userId, hasPaid } = (await req.json().catch(() => ({}))) as {
    userId?: string;
    hasPaid?: boolean;
  };
  if (!userId || typeof hasPaid !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  await sql`update users set has_paid = ${hasPaid} where id = ${userId}`;
  return NextResponse.json({ ok: true });
}
