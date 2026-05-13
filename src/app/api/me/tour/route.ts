import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { took?: string };
  // Marcamos como completado independientemente de si tomó tour o lo saltó.
  await sql`
    update users set tour_completed = true where id = ${session.user.id}
  `;
  return NextResponse.json({ ok: true, took: body.took ?? "skip" });
}
