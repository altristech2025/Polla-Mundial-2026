/**
 * Validación pre-producción: simulación con 3 estrategias ciegas.
 *
 * Setup:
 *   1. Definimos un "Mundial teórico" — resultado completo desde grupos hasta
 *      campeón. Lo definimos AQUÍ (yo lo sé), pero las 3 estrategias NO lo ven.
 *   2. Cada estrategia genera su pronóstico solo con info pública (ranking FIFA
 *      simulado vía pot, identidad del equipo). No tienen acceso al teórico.
 *   3. Calculamos scoring de cada estrategia vs el teórico.
 *   4. Validamos invariantes:
 *      - El que acierta al campeón debe vencer al que falla, a menos que la
 *        diferencia en fases tempranas sea desproporcionadamente grande.
 *      - Distribución de puntajes razonable (no todos 600, no todos 50).
 *
 * Uso: tsx --env-file=.env.local tests/simulation.ts
 */
import { neon } from "@neondatabase/serverless";
import {
  scorePrediction,
  type Prediction,
  type OfficialResults,
  type ScoreBreakdown,
  type R32Position,
  POINTS,
} from "../src/lib/scoring";
import {
  GROUPS,
  type GroupLetter,
  buildR32Bracket,
  determineBestThirds,
  POST_R32_TREE,
} from "../src/lib/qualification";
import { computeGroupStandings, type MatchScore } from "../src/lib/tiebreakers";

const sql = neon(process.env.DATABASE_URL!);

// ============================================================
// Tipos
// ============================================================
type Team = {
  id: string;
  code: string;
  name: string;
  group: GroupLetter;
  pot: 1 | 2 | 3 | 4; // 1 = top seed, 4 = bottom (corresponde a group_position)
};

type GroupMatch = {
  id: string;
  group: GroupLetter;
  matchDay: number;
  homeTeamId: string;
  awayTeamId: string;
};

// ============================================================
// Estrategias (NO ven el teórico)
// ============================================================
type Strategy = {
  name: string;
  description: string;
  predict(teams: Team[], matches: GroupMatch[]): Prediction;
};

/**
 * "Favorito": siempre gana el equipo de mejor pot (menor número).
 * Si empate de pot, gana por orden alfabético del código.
 */
const FAVORITO: Strategy = {
  name: "Favorito",
  description: "Pot bajo siempre vence. Confiada en seeds.",
  predict(teams, matches) {
    const tById = new Map(teams.map((t) => [t.id, t]));
    const winner = (aId: string, bId: string) => {
      const a = tById.get(aId)!;
      const b = tById.get(bId)!;
      if (a.pot !== b.pot) return a.pot < b.pot ? a.id : b.id;
      return a.code < b.code ? a.id : b.id;
    };

    // Group stage: top seed gana siempre. Score 2-0 si pot favorito, 1-1 si mismo pot.
    const groupScoreMap = new Map<string, MatchScore>();
    for (const m of matches) {
      const h = tById.get(m.homeTeamId)!;
      const a = tById.get(m.awayTeamId)!;
      let hs = 1, as = 1;
      if (h.pot < a.pot) { hs = 2; as = 0; }
      else if (h.pot > a.pot) { hs = 0; as = 2; }
      groupScoreMap.set(m.id, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: hs, awayScore: as });
    }

    return buildPredictionFromGroupsAndWinnerFn(
      teams, matches, groupScoreMap, "FAVORITO", winner
    );
  },
};

/**
 * "Caos": siempre gana el peor pot (mayor número). Sorpresas en cada partido.
 */
const CAOS: Strategy = {
  name: "Caos",
  description: "Apuesta a sorpresas. Pot alto vence al pot bajo.",
  predict(teams, matches) {
    const tById = new Map(teams.map((t) => [t.id, t]));
    const winner = (aId: string, bId: string) => {
      const a = tById.get(aId)!;
      const b = tById.get(bId)!;
      if (a.pot !== b.pot) return a.pot > b.pot ? a.id : b.id;
      return a.code > b.code ? a.id : b.id;
    };

    const groupScoreMap = new Map<string, MatchScore>();
    for (const m of matches) {
      const h = tById.get(m.homeTeamId)!;
      const a = tById.get(m.awayTeamId)!;
      let hs = 1, as = 1;
      if (h.pot > a.pot) { hs = 2; as = 1; }
      else if (h.pot < a.pot) { hs = 1; as = 2; }
      groupScoreMap.set(m.id, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: hs, awayScore: as });
    }

    return buildPredictionFromGroupsAndWinnerFn(
      teams, matches, groupScoreMap, "CAOS", winner
    );
  },
};

/**
 * "Mixto": 60% favorito + 40% sorpresa. Decide vía hash determinista del par.
 */
const MIXTO: Strategy = {
  name: "Mixto",
  description: "60% favorito, 40% sorpresa medida.",
  predict(teams, matches) {
    const tById = new Map(teams.map((t) => [t.id, t]));
    const seedHash = (a: string, b: string) => {
      const [x, y] = [a, b].sort();
      let h = 0;
      for (const c of `${x}|${y}|mixto`) h = (h * 31 + c.charCodeAt(0)) | 0;
      return Math.abs(h);
    };
    const winner = (aId: string, bId: string) => {
      const a = tById.get(aId)!;
      const b = tById.get(bId)!;
      // 40% probabilidad de sorpresa
      const upset = seedHash(aId, bId) % 100 < 40;
      const favored = a.pot <= b.pot ? a : b;
      const underdog = a.pot <= b.pot ? b : a;
      return upset ? underdog.id : favored.id;
    };

    const groupScoreMap = new Map<string, MatchScore>();
    for (const m of matches) {
      const w = winner(m.homeTeamId, m.awayTeamId);
      const isHome = w === m.homeTeamId;
      groupScoreMap.set(m.id, {
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: isHome ? 2 : 0,
        awayScore: isHome ? 0 : 2,
      });
    }

    return buildPredictionFromGroupsAndWinnerFn(
      teams, matches, groupScoreMap, "MIXTO", winner
    );
  },
};

// ============================================================
// El "Mundial teórico" — solo lo conoce el orquestador
// ============================================================
/**
 * Teórico: gana el equipo de pot 2 ("sorpresa moderada") en grupos,
 * pero en eliminación gana el equipo de menor pot (top seed). Y el campeón
 * es Argentina (pot 1 grupo J). Esto crea un teórico que ninguna estrategia
 * "predice" perfectamente.
 */
function buildTheoretical(teams: Team[], matches: GroupMatch[]) {
  const tById = new Map(teams.map((t) => [t.id, t]));

  const groupScoresOfficial = new Map<string, MatchScore>();
  for (const m of matches) {
    const h = tById.get(m.homeTeamId)!;
    const a = tById.get(m.awayTeamId)!;
    let hs = 1, as = 1;
    // En grupos: gana pot 2 sobre pot 1. Empate entre iguales. Pot bajo gana al alto.
    if (h.pot === 2 && a.pot === 1) { hs = 2; as = 0; }
    else if (h.pot === 1 && a.pot === 2) { hs = 0; as = 2; }
    else if (h.pot < a.pot) { hs = 2; as = 1; }
    else if (h.pot > a.pot) { hs = 1; as = 2; }
    groupScoresOfficial.set(m.id, {
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: hs, awayScore: as,
    });
  }

  // Eliminación: gana pot bajo (favorito). Argentina (ARG, pot 1 grupo J) llega al campeonato.
  const winnerKnockout = (aId: string, bId: string) => {
    const a = tById.get(aId)!;
    const b = tById.get(bId)!;
    if (a.code === "ARG") return a.id;
    if (b.code === "ARG") return b.id;
    if (a.pot !== b.pot) return a.pot < b.pot ? a.id : b.id;
    return a.code < b.code ? a.id : b.id;
  };

  return { groupScoresOfficial, winnerKnockout };
}

// ============================================================
// Helper: dado un mapa de scores de grupos + función para decidir
// ganadores en eliminación, construye una Prediction completa.
// ============================================================
function buildPredictionFromGroupsAndWinnerFn(
  teams: Team[],
  matches: GroupMatch[],
  groupScores: Map<string, MatchScore>,
  seed: string,
  winnerFn: (aId: string, bId: string) => string
): Prediction {
  const teamsByGroup: Record<GroupLetter, string[]> = Object.fromEntries(
    GROUPS.map((g) => [g, teams.filter((t) => t.group === g).map((t) => t.id)])
  ) as Record<GroupLetter, string[]>;

  // Compute group standings per strategy
  const groupResults = GROUPS.map((g) => {
    const gms = matches.filter((m) => m.group === g);
    const ms = gms.map((m) => groupScores.get(m.id)!);
    return {
      group: g as GroupLetter,
      standings: computeGroupStandings(teamsByGroup[g], ms, seed),
    };
  });

  const predictedR32 = new Map<string, R32Position>();
  for (const gr of groupResults) {
    predictedR32.set(gr.standings[0].teamId, 1);
    predictedR32.set(gr.standings[1].teamId, 2);
  }
  const { qualified } = determineBestThirds(groupResults, seed);
  for (const t of qualified) {
    predictedR32.set(t.teamId, 3);
  }
  const r32 = buildR32Bracket(groupResults, seed);

  // Resolve bracket cascade
  const matchParticipants = new Map<string, { home: string; away: string }>();
  for (const a of r32) {
    matchParticipants.set(a.matchCode, { home: a.homeTeamId, away: a.awayTeamId });
  }
  const picks = new Map<string, string>();
  const order = [
    "P73","P74","P75","P76","P77","P78","P79","P80",
    "P81","P82","P83","P84","P85","P86","P87","P88",
    "P89","P90","P91","P92","P93","P94","P95","P96",
    "P97","P98","P99","P100",
    "P101","P102",
  ];
  for (const code of order) {
    const tree = POST_R32_TREE[code];
    if (tree) {
      const homeWin = picks.get(tree.home)!;
      const awayWin = picks.get(tree.away)!;
      matchParticipants.set(code, { home: homeWin, away: awayWin });
    }
    const p = matchParticipants.get(code)!;
    picks.set(code, winnerFn(p.home, p.away));
  }
  // P103 (3rd) - participants are losers of P101, P102
  const p101 = matchParticipants.get("P101")!;
  const p102 = matchParticipants.get("P102")!;
  const loserP101 = picks.get("P101") === p101.home ? p101.away : p101.home;
  const loserP102 = picks.get("P102") === p102.home ? p102.away : p102.home;
  matchParticipants.set("P103", { home: loserP101, away: loserP102 });
  picks.set("P103", winnerFn(loserP101, loserP102));
  // P104 (final) - winners of P101, P102
  matchParticipants.set("P104", { home: picks.get("P101")!, away: picks.get("P102")! });
  picks.set("P104", winnerFn(picks.get("P101")!, picks.get("P102")!));

  const r16 = new Set<string>();
  const qf = new Set<string>();
  const sf = new Set<string>();
  const finalSet = new Set<string>();
  for (const code of ["P73","P74","P75","P76","P77","P78","P79","P80","P81","P82","P83","P84","P85","P86","P87","P88"]) r16.add(picks.get(code)!);
  for (const code of ["P89","P90","P91","P92","P93","P94","P95","P96"]) qf.add(picks.get(code)!);
  for (const code of ["P97","P98","P99","P100"]) sf.add(picks.get(code)!);
  for (const code of ["P101","P102"]) finalSet.add(picks.get(code)!);

  const champion = picks.get("P104")!;
  const p104 = matchParticipants.get("P104")!;
  const runnerUp = champion === p104.home ? p104.away : p104.home;
  const third = picks.get("P103")!;
  const p103 = matchParticipants.get("P103")!;
  const fourth = third === p103.home ? p103.away : p103.home;

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

// ============================================================
// Construir OfficialResults a partir del teórico
// ============================================================
function buildOfficialFromTheoretical(
  teams: Team[],
  matches: GroupMatch[],
  groupScores: Map<string, MatchScore>,
  winnerKnockout: (a: string, b: string) => string
): OfficialResults {
  const pred = buildPredictionFromGroupsAndWinnerFn(
    teams, matches, groupScores, "OFFICIAL", winnerKnockout
  );
  return {
    r32Positions: pred.predictedR32,
    r16Teams: pred.predictedR16,
    qfTeams: pred.predictedQF,
    sfTeams: pred.predictedSF,
    finalTeams: pred.predictedFinal,
    championId: pred.predictedChampion,
    runnerUpId: pred.predictedRunnerUp,
    thirdId: pred.predictedThird,
    fourthId: pred.predictedFourth,
  };
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log("\n🎲 SIMULACIÓN PRE-PRODUCCIÓN — Polla Mundial 2026\n");

  // Load real data
  const teamsRaw = (await sql`
    select id, code, name, group_letter, group_position from teams order by group_letter, group_position
  `) as Array<{ id: string; code: string; name: string; group_letter: string; group_position: number }>;
  const teams: Team[] = teamsRaw.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    group: t.group_letter as GroupLetter,
    pot: t.group_position as 1 | 2 | 3 | 4,
  }));

  const matchesRaw = (await sql`
    select id, group_letter, match_day, home_team_id, away_team_id from group_matches
  `) as Array<{ id: string; group_letter: string; match_day: number; home_team_id: string; away_team_id: string }>;
  const matches: GroupMatch[] = matchesRaw.map((m) => ({
    id: m.id,
    group: m.group_letter as GroupLetter,
    matchDay: m.match_day,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
  }));

  // Construir teórico
  const { groupScoresOfficial, winnerKnockout } = buildTheoretical(teams, matches);
  const official = buildOfficialFromTheoretical(teams, matches, groupScoresOfficial, winnerKnockout);

  const tById = new Map(teams.map((t) => [t.id, t]));
  console.log("Mundial teórico (lo conoce solo el orquestador):");
  console.log(`  🥇 Campeón:       ${tById.get(official.championId!)?.code} ${tById.get(official.championId!)?.name}`);
  console.log(`  🥈 Subcampeón:    ${tById.get(official.runnerUpId!)?.code} ${tById.get(official.runnerUpId!)?.name}`);
  console.log(`  🥉 3er puesto:    ${tById.get(official.thirdId!)?.code} ${tById.get(official.thirdId!)?.name}`);
  console.log(`  4° puesto:         ${tById.get(official.fourthId!)?.code} ${tById.get(official.fourthId!)?.name}`);
  const positionCount = (p: 1 | 2 | 3) =>
    Array.from(official.r32Positions.values()).filter((v) => v === p).length;
  console.log(`  R32 1° de grupo:  ${positionCount(1)}`);
  console.log(`  R32 2° de grupo:  ${positionCount(2)}`);
  console.log(`  R32 mejores 3°:   ${positionCount(3)}`);
  console.log("");

  // Correr las 3 estrategias
  const strategies: Strategy[] = [FAVORITO, CAOS, MIXTO];
  type Result = { strategy: Strategy; pred: Prediction; breakdown: ScoreBreakdown };
  const results: Result[] = strategies.map((s) => {
    const pred = s.predict(teams, matches);
    const breakdown = scorePrediction(pred, official);
    return { strategy: s, pred, breakdown };
  });

  // Imprimir leaderboard
  results.sort((a, b) => b.breakdown.total - a.breakdown.total);
  console.log("═══ LEADERBOARD ═══\n");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const champOk = r.pred.predictedChampion === official.championId;
    const champTeam = tById.get(r.pred.predictedChampion!);
    console.log(
      `${i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} ${r.strategy.name.padEnd(10)} ${String(r.breakdown.total).padStart(4)} pts  — campeón pickado: ${champTeam?.code} ${champOk ? "✓" : "✗"}`
    );
  }
  console.log("");

  // Breakdown detallado
  console.log("Breakdown por fase:");
  const hdrs = ["fase", ...strategies.map((s) => s.name)];
  console.log("  " + hdrs.map((h) => h.padEnd(12)).join("  "));
  const rows: Array<[string, (b: ScoreBreakdown) => number]> = [
    ["R32 pases", (b) => b.r32_passes],
    ["R32 posic", (b) => b.r32_positions],
    ["R16", (b) => b.r16],
    ["QF", (b) => b.qf],
    ["SF", (b) => b.sf],
    ["Final", (b) => b.final],
    ["Campeón", (b) => b.champion],
    ["Sub-C", (b) => b.runner_up],
    ["3°", (b) => b.third],
    ["4°", (b) => b.fourth],
  ];
  // POINTS export sigue siendo útil para validar columnas; lo dejamos sin imprimir.
  void POINTS;
  for (const [label, getter] of rows) {
    const cells = [label, ...results.map((r) => String(getter(r.breakdown)))];
    console.log("  " + cells.map((c) => c.padEnd(12)).join("  "));
  }
  console.log("  " + "─".repeat(50));
  console.log("  " + ["TOTAL", ...results.map((r) => String(r.breakdown.total))].map((c) => c.padEnd(12)).join("  "));

  // Validar invariantes
  console.log("\n═══ INVARIANTES ═══\n");
  const winner = results[0];
  const losers = results.slice(1);
  const winnerGotChamp = winner.pred.predictedChampion === official.championId;
  const losersGotChamp = losers.filter((r) => r.pred.predictedChampion === official.championId);

  if (winnerGotChamp) {
    console.log("✓ El ganador acertó al campeón (esperado).");
  } else if (losersGotChamp.length === 0) {
    console.log("✓ Nadie acertó al campeón, ganador definido por aciertos parciales (esperado).");
  } else {
    const diff = winner.breakdown.total - losersGotChamp[0].breakdown.total;
    if (diff < 80) {
      console.log(`⚠️  ALERTA: ganador no acertó campeón y le saca ${diff} pts al que sí.`);
      console.log(`   80 pts (valor del campeón) debería ser el mínimo para compensar. Revisar pesos.`);
    } else {
      console.log(`⚠ ganador no acertó al campeón pero le saca ${diff} pts en fases tempranas (mayor a 80).`);
    }
  }

  // Distribución
  const total = results.map((r) => r.breakdown.total);
  const max = Math.max(...total);
  const min = Math.min(...total);
  const spread = max - min;
  console.log(`Spread total: ${spread} pts (max ${max}, min ${min})`);
  if (max > 600) console.log("⚠️  Máximo > 600. Posible techo bajo, hay margen.");
  if (min < 30) console.log("⚠️  Mínimo < 30. Alguien hizo casi todo mal.");
  console.log(`Máximo teórico del sistema: 750 pts.`);

  console.log("\n✓ Simulación completa.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
