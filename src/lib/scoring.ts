/**
 * Sistema de puntos v2 — Polla Mundial 2026
 *
 * R32 (dieciseisavos): dos componentes por equipo
 *   - 3 pts por adivinar que pasa (sin importar posición)
 *   - +2 pts si además acertaste la POSICIÓN (1°, 2° o 3° mejor tercero)
 *   - Total por equipo: 3 (solo pase) o 5 (pase + posición exacta)
 *
 * R16 en adelante: solo importa el set de equipos, no orden ni cruces.
 *   - R16: 8, QF: 15, SF: 25, Final: 40
 *   - Campeón: 80, Sub-C: 40, 3°: 25, 4°: 15
 *
 * Sin bonus de top 4 exacto (eliminado en v2 — se deriva implícitamente de
 * los picks de P101/P102/P103/P104).
 */

export const POINTS = {
  R32_PASS: 3,
  R32_POSITION_BONUS: 2,
  R16: 8,
  QF: 15,
  SF: 25,
  FINAL: 40,
  CHAMPION: 80,
  RUNNER_UP: 40,
  THIRD: 25,
  FOURTH: 15,
} as const;

export type R32Position = 1 | 2 | 3; // 1 = primero de grupo, 2 = segundo, 3 = mejor tercero

export type ScoreBreakdown = {
  r32_passes: number;       // 3 pts × equipos acertados
  r32_positions: number;    // +2 pts × posición exacta
  r16: number;
  qf: number;
  sf: number;
  final: number;
  champion: number;
  runner_up: number;
  third: number;
  fourth: number;
  total: number;
};

export type OfficialResults = {
  /** Mapa teamId → posición real con la que clasificó a R32 */
  r32Positions: Map<string, R32Position>;
  /** Sets de equipos que llegaron a cada fase */
  r16Teams: Set<string>;
  qfTeams: Set<string>;
  sfTeams: Set<string>;
  finalTeams: Set<string>;
  championId: string | null;
  runnerUpId: string | null;
  thirdId: string | null;
  fourthId: string | null;
};

export type Prediction = {
  /** Mapa teamId → posición que el usuario predijo (1°, 2° o 3°) */
  predictedR32: Map<string, R32Position>;
  predictedR16: Set<string>;
  predictedQF: Set<string>;
  predictedSF: Set<string>;
  predictedFinal: Set<string>;
  predictedChampion: string | null;
  predictedRunnerUp: string | null;
  predictedThird: string | null;
  predictedFourth: string | null;
};

export function scorePrediction(
  pred: Prediction,
  official: OfficialResults
): ScoreBreakdown {
  const breakdown: ScoreBreakdown = {
    r32_passes: 0,
    r32_positions: 0,
    r16: 0,
    qf: 0,
    sf: 0,
    final: 0,
    champion: 0,
    runner_up: 0,
    third: 0,
    fourth: 0,
    total: 0,
  };

  // R32: por cada equipo predicho, ver si pasó y si la posición coincide
  for (const [teamId, predictedPos] of pred.predictedR32) {
    const actualPos = official.r32Positions.get(teamId);
    if (actualPos === undefined) continue;
    breakdown.r32_passes += POINTS.R32_PASS;
    if (actualPos === predictedPos) {
      breakdown.r32_positions += POINTS.R32_POSITION_BONUS;
    }
  }

  for (const id of pred.predictedR16) {
    if (official.r16Teams.has(id)) breakdown.r16 += POINTS.R16;
  }
  for (const id of pred.predictedQF) {
    if (official.qfTeams.has(id)) breakdown.qf += POINTS.QF;
  }
  for (const id of pred.predictedSF) {
    if (official.sfTeams.has(id)) breakdown.sf += POINTS.SF;
  }
  for (const id of pred.predictedFinal) {
    if (official.finalTeams.has(id)) breakdown.final += POINTS.FINAL;
  }

  if (pred.predictedChampion && pred.predictedChampion === official.championId)
    breakdown.champion = POINTS.CHAMPION;
  if (pred.predictedRunnerUp && pred.predictedRunnerUp === official.runnerUpId)
    breakdown.runner_up = POINTS.RUNNER_UP;
  if (pred.predictedThird && pred.predictedThird === official.thirdId)
    breakdown.third = POINTS.THIRD;
  if (pred.predictedFourth && pred.predictedFourth === official.fourthId)
    breakdown.fourth = POINTS.FOURTH;

  breakdown.total =
    breakdown.r32_passes +
    breakdown.r32_positions +
    breakdown.r16 +
    breakdown.qf +
    breakdown.sf +
    breakdown.final +
    breakdown.champion +
    breakdown.runner_up +
    breakdown.third +
    breakdown.fourth;

  return breakdown;
}

/**
 * Máximo teórico:
 *   R32: 32 × 5 = 160
 *   R16: 16 × 8 = 128
 *   QF:   8 × 15 = 120
 *   SF:   4 × 25 = 100
 *   Final: 2 × 40 = 80
 *   Top 4 ordenado: 80 + 40 + 25 + 15 = 160
 *   Total: 748
 */
export const MAX_POSSIBLE_SCORE = 748;
