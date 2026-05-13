import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { BracketClient } from "./bracket-client";
import {
  GROUPS,
  buildR32Bracket,
  type GroupLetter,
  POST_R32_TREE,
} from "@/lib/qualification";
import { computeGroupStandings } from "@/lib/tiebreakers";

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
  home_team_id: string;
  away_team_id: string;
};

type PredScoreRow = {
  group_match_id: string;
  home_score: number;
  away_score: number;
};

type BracketRow = {
  match_code: string;
  round: string;
  match_date: string;
  venue: string;
  slot_spec: string;
};

type PickRow = {
  match_code: string;
  picked_winner_id: string | null;
  picked_home_team_id: string | null;
  picked_away_team_id: string | null;
};

type ConfigRow = { predictions_lock_at: string };
type PredStatusRow = { status: string };

export default async function BracketPage() {
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
    select id, group_letter, home_team_id, away_team_id from group_matches
  `) as unknown as MatchRow[];

  const predScores = (await sql`
    select pgs.group_match_id, pgs.home_score, pgs.away_score
    from prediction_group_scores pgs
    join predictions p on p.id = pgs.prediction_id
    where p.user_id = ${userId}
  `) as unknown as PredScoreRow[];

  const bracket = (await sql`
    select match_code, round, match_date::text, venue, slot_spec
    from bracket_matches order by match_code
  `) as unknown as BracketRow[];

  const picks = (await sql`
    select pbp.match_code, pbp.picked_winner_id, pbp.picked_home_team_id, pbp.picked_away_team_id
    from prediction_bracket_picks pbp
    join predictions p on p.id = pbp.prediction_id
    where p.user_id = ${userId}
  `) as unknown as PickRow[];

  const [predStatus] = (await sql`
    select status from predictions where user_id = ${userId}
  `) as unknown as PredStatusRow[];
  const submitted = predStatus?.status === "submitted";

  // Reconstruir standings de cada grupo a partir de las predicciones del usuario
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const scoreById = new Map(
    predScores.map((s) => [s.group_match_id, { home: s.home_score, away: s.away_score }])
  );

  const allGroupsComplete = GROUPS.every((g) => {
    const groupMatches = matches.filter((m) => m.group_letter === g);
    return groupMatches.every((gm) => scoreById.has(gm.id));
  });

  let r32Assignments: Array<{ matchCode: string; homeTeamId: string; awayTeamId: string }> = [];
  if (allGroupsComplete) {
    const groupResults = GROUPS.map((g) => {
      const groupTeamIds = teams.filter((t) => t.group_letter === g).map((t) => t.id);
      const groupMatches = matches.filter((m) => m.group_letter === g);
      const matchScores = groupMatches.map((gm) => {
        const s = scoreById.get(gm.id)!;
        return {
          homeTeamId: gm.home_team_id,
          awayTeamId: gm.away_team_id,
          homeScore: s.home,
          awayScore: s.away,
        };
      });
      return {
        group: g as GroupLetter,
        standings: computeGroupStandings(groupTeamIds, matchScores, userId),
      };
    });
    r32Assignments = buildR32Bracket(groupResults, userId);
  }

  return (
    <BracketClient
      teamMap={Object.fromEntries(
        teams.map((t) => [
          t.id,
          { id: t.id, code: t.code, name: t.name, flag: t.flag_emoji },
        ])
      )}
      bracketMatches={bracket.map((b) => ({
        matchCode: b.match_code,
        round: b.round,
        matchDate: b.match_date,
        venue: b.venue,
        slotSpec: b.slot_spec,
      }))}
      r32Assignments={r32Assignments}
      r32Ready={allGroupsComplete}
      postR32Tree={POST_R32_TREE}
      picks={Object.fromEntries(picks.map((p) => [p.match_code, p.picked_winner_id]))}
      lockIso={config.predictions_lock_at}
      submitted={submitted}
    />
  );
}
