/**
 * Recompute scores: para cada predicción submitted, calcular puntos basados en
 * los resultados oficiales actuales en DB.
 */
import { sql } from "@/lib/db";
import {
  scorePrediction,
  type Prediction,
  type OfficialResults,
  type ScoreBreakdown,
  type R32Position,
} from "@/lib/scoring";
import {
  GROUPS,
  type GroupLetter,
  determineBestThirds,
} from "@/lib/qualification";
import { computeGroupStandings } from "@/lib/tiebreakers";
import { groupBy } from "@/lib/utils";
import { R32_CODES, R16_CODES, QF_CODES, SF_CODES } from "@/lib/bracket-codes";

type TeamRow = {
  id: string;
  group_letter: string;
  group_position: number;
};

type GroupMatchRow = {
  id: string;
  group_letter: string;
  home_team_id: string;
  away_team_id: string;
  official_home_score: number | null;
  official_away_score: number | null;
};

type BracketRow = {
  match_code: string;
  round: string;
  official_winner_id: string | null;
  official_loser_id: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
};

type PredScoreRow = {
  prediction_id: string;
  group_match_id: string;
  home_score: number;
  away_score: number;
};

type PredPickRow = {
  prediction_id: string;
  match_code: string;
  picked_winner_id: string | null;
};

export async function recomputeAllScores(): Promise<number> {
  const teams = (await sql`
    select id, group_letter, group_position from teams
  `) as unknown as TeamRow[];
  const teamsByGroup: Record<GroupLetter, string[]> = Object.fromEntries(
    GROUPS.map((g) => [g, teams.filter((t) => t.group_letter === g).map((t) => t.id)])
  ) as Record<GroupLetter, string[]>;

  const groupMatches = (await sql`
    select id, group_letter, home_team_id, away_team_id, official_home_score, official_away_score
    from group_matches
  `) as unknown as GroupMatchRow[];

  const bracketMatches = (await sql`
    select match_code, round, official_winner_id, official_loser_id
    from bracket_matches
  `) as unknown as BracketRow[];

  const official = buildOfficialResults(teamsByGroup, groupMatches, bracketMatches);

  const predictions = (await sql`
    select id, user_id from predictions where status = 'submitted'
  `) as unknown as PredictionRow[];

  if (predictions.length === 0) return 0;

  const predIds = predictions.map((p) => p.id);

  const allScores = (await sql`
    select prediction_id, group_match_id, home_score, away_score
    from prediction_group_scores
    where prediction_id = any(${predIds})
  `) as unknown as PredScoreRow[];

  const allPicks = (await sql`
    select prediction_id, match_code, picked_winner_id
    from prediction_bracket_picks
    where prediction_id = any(${predIds})
  `) as unknown as PredPickRow[];

  const scoreByPred = groupBy(allScores, (r) => r.prediction_id);
  const picksByPred = groupBy(allPicks, (r) => r.prediction_id);

  let updated = 0;
  for (const pred of predictions) {
    const userScores = scoreByPred.get(pred.id) ?? [];
    const userPicks = picksByPred.get(pred.id) ?? [];

    const predicted = buildUserPrediction(
      pred.user_id,
      userScores,
      userPicks,
      teamsByGroup,
      groupMatches
    );

    const breakdown = scorePrediction(predicted, official);
    await sql`
      update predictions set
        total_score = ${breakdown.total},
        score_breakdown = ${JSON.stringify(breakdown)}::jsonb,
        updated_at = now()
      where id = ${pred.id}
    `;
    updated++;
  }

  return updated;
}

/**
 * Construye los OfficialResults a partir de los resultados oficiales actuales
 * en DB (group_matches.official_* y bracket_matches.official_*).
 */
export function buildOfficialResults(
  teamsByGroup: Record<GroupLetter, string[]>,
  groupMatches: GroupMatchRow[],
  bracketMatches: BracketRow[]
): OfficialResults {
  const r32Positions = new Map<string, R32Position>();

  const allGroupsHaveResults = GROUPS.every((g) =>
    groupMatches
      .filter((m) => m.group_letter === g)
      .every((m) => m.official_home_score !== null && m.official_away_score !== null)
  );

  if (allGroupsHaveResults) {
    const groupResults = GROUPS.map((g) => {
      const gm = groupMatches.filter((m) => m.group_letter === g);
      const matchScores = gm.map((m) => ({
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: m.official_home_score!,
        awayScore: m.official_away_score!,
      }));
      return {
        group: g as GroupLetter,
        standings: computeGroupStandings(teamsByGroup[g], matchScores, "official"),
      };
    });

    // 1° de cada grupo
    for (const gr of groupResults) {
      r32Positions.set(gr.standings[0].teamId, 1);
      r32Positions.set(gr.standings[1].teamId, 2);
    }

    // 8 mejores terceros
    const { qualified } = determineBestThirds(groupResults, "official");
    for (const t of qualified) {
      r32Positions.set(t.teamId, 3);
    }
  }

  const r16Teams = new Set<string>();
  const qfTeams = new Set<string>();
  const sfTeams = new Set<string>();
  const finalTeams = new Set<string>();

  for (const b of bracketMatches) {
    if (!b.official_winner_id) continue;
    if (b.round === "R32") r16Teams.add(b.official_winner_id);
    else if (b.round === "R16") qfTeams.add(b.official_winner_id);
    else if (b.round === "QF") sfTeams.add(b.official_winner_id);
    else if (b.round === "SF") finalTeams.add(b.official_winner_id);
  }

  const finalMatch = bracketMatches.find((b) => b.round === "FINAL");
  const thirdMatch = bracketMatches.find((b) => b.round === "3RD");

  return {
    r32Positions,
    r16Teams,
    qfTeams,
    sfTeams,
    finalTeams,
    championId: finalMatch?.official_winner_id ?? null,
    runnerUpId: finalMatch?.official_loser_id ?? null,
    thirdId: thirdMatch?.official_winner_id ?? null,
    fourthId: thirdMatch?.official_loser_id ?? null,
  };
}

export function buildUserPrediction(
  userId: string,
  scores: PredScoreRow[],
  picks: PredPickRow[],
  teamsByGroup: Record<GroupLetter, string[]>,
  groupMatches: GroupMatchRow[]
): Prediction {
  const predictedR32 = new Map<string, R32Position>();
  const r16 = new Set<string>();
  const qf = new Set<string>();
  const sf = new Set<string>();
  const finalSet = new Set<string>();

  const scoreByMatch = new Map(scores.map((s) => [s.group_match_id, s]));
  const allGroupsComplete = GROUPS.every((g) =>
    groupMatches
      .filter((m) => m.group_letter === g)
      .every((m) => scoreByMatch.has(m.id))
  );

  if (allGroupsComplete) {
    const groupResults = GROUPS.map((g) => {
      const gm = groupMatches.filter((m) => m.group_letter === g);
      const matchScores = gm.map((m) => {
        const s = scoreByMatch.get(m.id)!;
        return {
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          homeScore: s.home_score,
          awayScore: s.away_score,
        };
      });
      return {
        group: g as GroupLetter,
        standings: computeGroupStandings(teamsByGroup[g], matchScores, userId),
      };
    });

    for (const gr of groupResults) {
      predictedR32.set(gr.standings[0].teamId, 1);
      predictedR32.set(gr.standings[1].teamId, 2);
    }

    const { qualified } = determineBestThirds(groupResults, userId);
    for (const t of qualified) {
      predictedR32.set(t.teamId, 3);
    }
  }

  const pickByMatch = new Map(picks.map((p) => [p.match_code, p.picked_winner_id]));

  const collectWinners = (codes: readonly string[], target: Set<string>) => {
    for (const c of codes) {
      const w = pickByMatch.get(c);
      if (w) target.add(w);
    }
  };
  collectWinners(R32_CODES, r16);
  collectWinners(R16_CODES, qf);
  collectWinners(QF_CODES, sf);
  collectWinners(SF_CODES, finalSet);

  const p101Winner = pickByMatch.get("P101") ?? null;
  const p102Winner = pickByMatch.get("P102") ?? null;
  const p101Loser = computeSemiLoser("P101", pickByMatch);
  const p102Loser = computeSemiLoser("P102", pickByMatch);
  const champion = pickByMatch.get("P104") ?? null;
  const third = pickByMatch.get("P103") ?? null;

  let runnerUp: string | null = null;
  if (champion && p101Winner && p102Winner) {
    runnerUp = champion === p101Winner ? p102Winner : champion === p102Winner ? p101Winner : null;
  }
  let fourth: string | null = null;
  if (third && p101Loser && p102Loser) {
    fourth = third === p101Loser ? p102Loser : third === p102Loser ? p101Loser : null;
  }

  return {
    predictedR32,
    predictedR16: r16,
    predictedQF: qf,
    predictedSF: sf,
    predictedFinal: finalSet,
    predictedChampion: champion,
    predictedRunnerUp: runnerUp,
    predictedThird: third,
    predictedFourth: fourth,
  };
}

function computeSemiLoser(
  semiCode: "P101" | "P102",
  pickByMatch: Map<string, string | null>
): string | null {
  const feeders = semiCode === "P101" ? ["P97", "P98"] : ["P99", "P100"];
  const homeWinner = pickByMatch.get(feeders[0]) ?? null;
  const awayWinner = pickByMatch.get(feeders[1]) ?? null;
  const semiWinner = pickByMatch.get(semiCode) ?? null;
  if (!homeWinner || !awayWinner || !semiWinner) return null;
  if (semiWinner === homeWinner) return awayWinner;
  if (semiWinner === awayWinner) return homeWinner;
  return null;
}

export { type ScoreBreakdown };
