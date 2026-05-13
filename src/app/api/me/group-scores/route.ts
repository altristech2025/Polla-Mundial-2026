import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

type Payload = {
  scores?: Array<{
    groupMatchId: string;
    homeScore: number | null;
    awayScore: number | null;
  }>;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as Payload;
  if (!body.scores || !Array.isArray(body.scores)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const [config] = (await sql`
    select predictions_lock_at from app_config where id = 1
  `) as unknown as Array<{ predictions_lock_at: string }>;
  if (new Date(config.predictions_lock_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "predictions_locked" }, { status: 403 });
  }

  const [pred] = (await sql`
    select id, status from predictions where user_id = ${userId} limit 1
  `) as unknown as Array<{ id: string; status: string }>;
  if (!pred) {
    return NextResponse.json({ error: "no_prediction_row" }, { status: 500 });
  }
  if (pred.status === "submitted") {
    return NextResponse.json(
      { error: "Pronóstico ya enviado, no se puede editar." },
      { status: 403 }
    );
  }

  const toDelete: string[] = [];
  const toUpsertIds: string[] = [];
  const toUpsertHome: number[] = [];
  const toUpsertAway: number[] = [];
  for (const s of body.scores) {
    if (s.homeScore === null || s.awayScore === null) {
      toDelete.push(s.groupMatchId);
    } else if (
      Number.isInteger(s.homeScore) && Number.isInteger(s.awayScore) &&
      s.homeScore >= 0 && s.awayScore >= 0 &&
      s.homeScore <= 99 && s.awayScore <= 99
    ) {
      toUpsertIds.push(s.groupMatchId);
      toUpsertHome.push(s.homeScore);
      toUpsertAway.push(s.awayScore);
    }
  }

  if (toDelete.length > 0) {
    await sql`
      delete from prediction_group_scores
      where prediction_id = ${pred.id} and group_match_id = any(${toDelete}::uuid[])
    `;
  }
  if (toUpsertIds.length > 0) {
    await sql`
      insert into prediction_group_scores (prediction_id, group_match_id, home_score, away_score)
      select ${pred.id}::uuid, unnest(${toUpsertIds}::uuid[]),
             unnest(${toUpsertHome}::int[]), unnest(${toUpsertAway}::int[])
      on conflict (prediction_id, group_match_id) do update
        set home_score = excluded.home_score, away_score = excluded.away_score
    `;
  }

  return NextResponse.json({ ok: true });
}
