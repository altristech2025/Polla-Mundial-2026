/**
 * POST /api/me/submit
 * Marca la predicción del usuario como 'submitted' (queda quemada, sin más edits).
 *
 * Valida que el pronóstico esté completo:
 *   - 72 marcadores de fase de grupos
 *   - 32 picks de bracket (R32 a FINAL incluido)
 * Si falta algo, devuelve 400 con detalle.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { ALL_BRACKET_CODES } from "@/lib/bracket-codes";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [pred] = (await sql`
    select id, status from predictions where user_id = ${userId}
  `) as unknown as Array<{ id: string; status: string }>;
  if (!pred) {
    return NextResponse.json({ error: "no_prediction" }, { status: 500 });
  }
  if (pred.status === "submitted") {
    return NextResponse.json(
      { error: "Tu pronóstico ya fue enviado." },
      { status: 409 }
    );
  }

  // Validar completitud
  const [groupCount] = (await sql`
    select count(*)::int as c
    from prediction_group_scores
    where prediction_id = ${pred.id}
  `) as unknown as Array<{ c: number }>;
  if (groupCount.c < 72) {
    return NextResponse.json(
      {
        error: `Faltan marcadores de fase de grupos (${groupCount.c}/72).`,
        completedGroups: groupCount.c,
        requiredGroups: 72,
      },
      { status: 400 }
    );
  }

  const bracketPicks = (await sql`
    select match_code from prediction_bracket_picks
    where prediction_id = ${pred.id} and picked_winner_id is not null
  `) as unknown as Array<{ match_code: string }>;
  const have = new Set(bracketPicks.map((p) => p.match_code));
  const missing = ALL_BRACKET_CODES.filter((c) => !have.has(c));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Faltan picks de eliminación (${missing.length} partidos sin elegir).`,
        missingMatches: missing,
      },
      { status: 400 }
    );
  }

  await sql`
    update predictions
    set status = 'submitted', submitted_at = now()
    where id = ${pred.id}
  `;

  return NextResponse.json({ ok: true });
}
