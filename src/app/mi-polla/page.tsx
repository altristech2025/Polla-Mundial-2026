import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { MiPollaClient } from "./mi-polla-client";

async function clearAuthCookiesAndRedirect(): Promise<never> {
  const c = await cookies();
  // En dev no hay HTTPS → authjs.session-token. En prod → __Secure-authjs.session-token.
  c.delete("authjs.session-token");
  c.delete("__Secure-authjs.session-token");
  redirect("/");
}

type DashboardRow = {
  predictions_lock_at: string;
  reveal_at: string;
  tournament_start_at: string;
  user_id: string | null;
  display_name: string | null;
  is_admin: boolean | null;
  tour_completed: boolean | null;
  pred_id: string | null;
  pred_status: string | null;
  submitted_at: string | null;
  group_count: number;
  bracket_count: number;
};

export default async function MiPollaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  // Una sola query trae todo: config + user + prediction + contadores.
  const rows = (await sql`
    select
      c.predictions_lock_at,
      c.reveal_at,
      c.tournament_start_at,
      u.id              as user_id,
      u.display_name,
      u.is_admin,
      u.tour_completed,
      p.id              as pred_id,
      p.status          as pred_status,
      p.submitted_at::text,
      coalesce((select count(*)::int from prediction_group_scores where prediction_id = p.id), 0)
        as group_count,
      coalesce((select count(*)::int from prediction_bracket_picks
        where prediction_id = p.id and picked_winner_id is not null), 0)
        as bracket_count
    from app_config c
    left join users u on u.id = ${session.user.id}
    left join predictions p on p.user_id = u.id
    where c.id = 1
  `) as unknown as DashboardRow[];

  const data = rows[0];
  if (!data || !data.user_id) await clearAuthCookiesAndRedirect();

  // Defensivo: crear prediction si no existe.
  let predId = data.pred_id;
  let predStatus = data.pred_status ?? "draft";
  let submittedAt: string | null = data.submitted_at;
  if (!predId) {
    const inserted = (await sql`
      insert into predictions (user_id) values (${session.user.id})
      returning id, status, submitted_at::text
    `) as unknown as Array<{ id: string; status: string; submitted_at: string | null }>;
    predId = inserted[0].id;
    predStatus = inserted[0].status;
    submittedAt = inserted[0].submitted_at;
  }

  return (
    <MiPollaClient
      displayName={data.display_name!}
      tourCompleted={!!data.tour_completed}
      isAdmin={!!data.is_admin}
      tournamentStartIso={data.tournament_start_at}
      lockIso={data.predictions_lock_at}
      predictionStatus={predStatus}
      submittedAt={submittedAt}
      groupScoresFilled={data.group_count}
      bracketPicksFilled={data.bracket_count}
    />
  );
}
