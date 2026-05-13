/**
 * Toggle suspended (cosmético) for a user. Admin-only.
 * POST { userId, suspended: boolean }
 *
 * Cuando un pana está suspended, desaparece de /resultados y del ranking,
 * pero sigue pudiendo loguearse, editar y enviar. Sus predicciones quedan
 * intactas; al recolocarlo aparece como si nada.
 *
 * Guard: el admin no puede auto-suspenderse (red de seguridad). El demo del
 * frontend tampoco ofrece el botón sobre uno mismo, pero por si acaso.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { userId, suspended } = (await req.json().catch(() => ({}))) as {
    userId?: string;
    suspended?: boolean;
  };
  if (!userId || typeof suspended !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (userId === session.user.id && suspended === true) {
    return NextResponse.json(
      { error: "no te puedes auto-castigar pana" },
      { status: 400 }
    );
  }
  await sql`update users set is_suspended = ${suspended} where id = ${userId}`;
  revalidatePath("/resultados");
  revalidatePath("/admin");
  return NextResponse.json({ ok: true });
}
