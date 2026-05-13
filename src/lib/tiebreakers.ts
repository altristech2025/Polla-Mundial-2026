/**
 * FIFA-style tiebreakers para fase de grupos
 * Orden oficial (per PDF):
 *   1. Puntos
 *   2. Diferencia de goles
 *   3. Goles a favor
 *   4. Duelo directo (solo si empate es entre equipos del mismo grupo)
 *   5. Fair play (en predicciones lo dejamos en 0)
 *   6. Sorteo (hash determinista del par)
 */

export type TeamStanding = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

export type MatchScore = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

/**
 * Calcula standings de un grupo a partir de los 6 marcadores.
 * Devuelve teams ordenados (1° primero) con tiebreakers aplicados.
 */
export function computeGroupStandings(
  teamIds: string[],
  matches: MatchScore[],
  drawSeed: string = "global"
): TeamStanding[] {
  const standings = new Map<string, TeamStanding>();
  for (const id of teamIds) {
    standings.set(id, {
      teamId: id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const m of matches) {
    const home = standings.get(m.homeTeamId);
    const away = standings.get(m.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (m.homeScore < m.awayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }

  for (const s of standings.values()) {
    s.goalDiff = s.goalsFor - s.goalsAgainst;
  }

  return [...standings.values()].sort((a, b) =>
    compareStandings(a, b, matches, drawSeed)
  );
}

function compareStandings(
  a: TeamStanding,
  b: TeamStanding,
  matches: MatchScore[],
  drawSeed: string
): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.goalDiff !== b.goalDiff) return b.goalDiff - a.goalDiff;
  if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;

  // Duelo directo (solo aplica si están en el mismo grupo, lo cual asumimos
  // porque esta función opera sobre standings de un grupo)
  const head = matches.find(
    (m) =>
      (m.homeTeamId === a.teamId && m.awayTeamId === b.teamId) ||
      (m.homeTeamId === b.teamId && m.awayTeamId === a.teamId)
  );
  if (head) {
    const aGoals = head.homeTeamId === a.teamId ? head.homeScore : head.awayScore;
    const bGoals = head.homeTeamId === b.teamId ? head.homeScore : head.awayScore;
    if (aGoals !== bGoals) return bGoals - aGoals;
  }

  // Fair play: 0 para todos en predicciones → sigue a sorteo determinista
  return deterministicDraw(a.teamId, b.teamId, drawSeed);
}

/**
 * "Sorteo" determinista: hash simple del par + seed para que el resultado
 * sea reproducible y no dependa del orden de inputs.
 */
function deterministicDraw(idA: string, idB: string, seed: string): number {
  const [first, second] = [idA, idB].sort();
  const input = `${seed}|${first}|${second}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  // Si A es "first" alfabéticamente y hash es par → A gana; impar → B gana.
  // Devolvemos comparator-style: negativo si "a" debe ir antes.
  const aIsFirst = idA === first;
  const aWins = hash % 2 === 0;
  if (aIsFirst === aWins) return -1;
  return 1;
}

/**
 * Ranking global de terceros para determinar los 8 mejores.
 * Usa los mismos tiebreakers pero el "duelo directo" no aplica (distintos grupos).
 */
export function rankBestThirds(
  thirds: TeamStanding[],
  drawSeed: string = "global"
): TeamStanding[] {
  return [...thirds].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.goalDiff !== b.goalDiff) return b.goalDiff - a.goalDiff;
    if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
    return deterministicDraw(a.teamId, b.teamId, drawSeed);
  });
}
