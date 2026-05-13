import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { GruposClient, type GroupBundle } from "./grupos-client";
import { GROUPS } from "@/lib/qualification";

type TeamRow = {
  id: string;
  code: string;
  name: string;
  flag_emoji: string | null;
  group_letter: string;
  group_position: number;
};

type MatchRow = {
  id: string;
  group_letter: string;
  match_day: number;
  match_date: string;
  home_team_id: string;
  away_team_id: string;
};

type PredScoreRow = {
  group_match_id: string;
  home_score: number;
  away_score: number;
};

type ConfigRow = { predictions_lock_at: string };
type PredStatusRow = { status: string };

export default async function GruposPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [config] = (await sql`
    select predictions_lock_at from app_config where id = 1
  `) as unknown as ConfigRow[];

  const teams = (await sql`
    select id, code, name, flag_emoji, group_letter, group_position
    from teams order by group_letter, group_position
  `) as unknown as TeamRow[];

  const matches = (await sql`
    select id, group_letter, match_day, match_date::text, home_team_id, away_team_id
    from group_matches order by group_letter, match_day, match_date
  `) as unknown as MatchRow[];

  const predRows = (await sql`
    select pgs.group_match_id, pgs.home_score, pgs.away_score
    from prediction_group_scores pgs
    join predictions p on p.id = pgs.prediction_id
    where p.user_id = ${userId}
  `) as unknown as PredScoreRow[];

  const [predStatus] = (await sql`
    select status from predictions where user_id = ${userId}
  `) as unknown as PredStatusRow[];
  const submitted = predStatus?.status === "submitted";

  const predLookup = new Map<string, { home: number; away: number }>();
  for (const r of predRows) {
    predLookup.set(r.group_match_id, { home: r.home_score, away: r.away_score });
  }

  const bundles: GroupBundle[] = GROUPS.map((g) => {
    const groupTeams = teams.filter((t) => t.group_letter === g);
    const groupMatches = matches
      .filter((m) => m.group_letter === g)
      .map((m) => ({
        id: m.id,
        matchDay: m.match_day,
        matchDate: m.match_date,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: predLookup.get(m.id)?.home ?? null,
        awayScore: predLookup.get(m.id)?.away ?? null,
      }));
    return {
      group: g,
      teams: groupTeams.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        flag: t.flag_emoji,
        position: t.group_position,
      })),
      matches: groupMatches,
    };
  });

  return (
    <GruposClient
      bundles={bundles}
      lockIso={config.predictions_lock_at}
      submitted={submitted}
    />
  );
}
