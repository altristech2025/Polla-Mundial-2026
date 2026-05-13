import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

type Payload = {
  picks?: Array<{ matchCode: string; pickedWinnerId: string | null }>;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as Payload;
  if (!body.picks || !Array.isArray(body.picks)) {
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
  const upsertCodes: string[] = [];
  const upsertWinners: string[] = [];
  for (const p of body.picks) {
    if (p.pickedWinnerId === null) {
      toDelete.push(p.matchCode);
    } else {
      upsertCodes.push(p.matchCode);
      upsertWinners.push(p.pickedWinnerId);
    }
  }

  if (toDelete.length > 0) {
    await sql`
      delete from prediction_bracket_picks
      where prediction_id = ${pred.id} and match_code = any(${toDelete}::text[])
    `;
  }
  if (upsertCodes.length > 0) {
    await sql`
      insert into prediction_bracket_picks (prediction_id, match_code, picked_winner_id)
      select ${pred.id}::uuid, unnest(${upsertCodes}::text[]), unnest(${upsertWinners}::uuid[])
      on conflict (prediction_id, match_code) do update
        set picked_winner_id = excluded.picked_winner_id
    `;
  }

  return NextResponse.json({ ok: true });
}
