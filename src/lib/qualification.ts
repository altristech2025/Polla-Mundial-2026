import {
  computeGroupStandings,
  rankBestThirds,
  type MatchScore,
  type TeamStanding,
} from "./tiebreakers";
import { THIRD_PLACE_SLOTS } from "@/data/fifa-third-place-allocation-2026";

export const GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"] as const;
export type GroupLetter = (typeof GROUPS)[number];

export type QualifiedTeam = {
  teamId: string;
  group: GroupLetter;
  position: 1 | 2 | 3;          // 1° de grupo, 2°, o mejor 3°
};

export type GroupResult = {
  group: GroupLetter;
  standings: TeamStanding[];     // 4 equipos ordenados 1°..4°
};

export type BracketAssignment = {
  matchCode: string;
  homeTeamId: string;
  awayTeamId: string;
};

/**
 * Calcula los standings de los 12 grupos a partir de los 72 marcadores.
 */
export function computeAllGroups(
  groupTeams: Record<GroupLetter, string[]>,
  matches: Array<MatchScore & { group: GroupLetter }>,
  drawSeed: string
): GroupResult[] {
  return GROUPS.map((g) => {
    const gMatches = matches.filter((m) => m.group === g);
    return {
      group: g,
      standings: computeGroupStandings(groupTeams[g], gMatches, drawSeed),
    };
  });
}

/**
 * Determina los 8 mejores terceros (orden de mejor a peor).
 * Devuelve también los teamIds que NO clasificaron (los 4 peores).
 */
export function determineBestThirds(
  groupResults: GroupResult[],
  drawSeed: string
): { qualified: TeamStanding[]; qualifiedGroups: GroupLetter[] } {
  const thirds = groupResults.map((gr) => ({
    ...gr.standings[2],
    __group: gr.group as GroupLetter,
  }));
  const ranked = rankBestThirds(thirds, drawSeed) as Array<
    TeamStanding & { __group: GroupLetter }
  >;
  const qualified = ranked.slice(0, 8);
  const qualifiedGroups = qualified.map((t) => t.__group);
  return { qualified, qualifiedGroups };
}

/**
 * Asigna cada uno de los 8 mejores terceros a su slot R32, respetando la tabla
 * de elegibilidad FIFA. Usa backtracking para encontrar una asignación válida.
 *
 * Si no hay asignación válida posible (no debería pasar con eligibility correcta),
 * lanza error.
 */
export function allocateBestThirds(
  qualifiedGroups: GroupLetter[]
): Map<string, GroupLetter> {
  const slots = THIRD_PLACE_SLOTS;
  const result = new Map<string, GroupLetter>();
  const used = new Set<GroupLetter>();

  function backtrack(slotIdx: number): boolean {
    if (slotIdx === slots.length) return true;
    const slot = slots[slotIdx];
    for (const g of slot.eligibleThirdGroups) {
      if (used.has(g as GroupLetter)) continue;
      if (!qualifiedGroups.includes(g as GroupLetter)) continue;
      used.add(g as GroupLetter);
      result.set(slot.matchCode, g as GroupLetter);
      if (backtrack(slotIdx + 1)) return true;
      used.delete(g as GroupLetter);
      result.delete(slot.matchCode);
    }
    return false;
  }

  if (!backtrack(0)) {
    throw new Error(
      `No se pudo asignar 8 mejores terceros a slots R32 con grupos qualified: ${qualifiedGroups.join(",")}`
    );
  }
  return result;
}

/**
 * Construye los 16 cruces de R32 a partir de los standings de grupos.
 */
export function buildR32Bracket(
  groupResults: GroupResult[],
  drawSeed: string
): BracketAssignment[] {
  // Lookup helpers
  const byGroup = new Map<GroupLetter, TeamStanding[]>();
  for (const gr of groupResults) byGroup.set(gr.group, gr.standings);

  const first = (g: GroupLetter) => byGroup.get(g)![0].teamId;
  const second = (g: GroupLetter) => byGroup.get(g)![1].teamId;

  // Best thirds
  const { qualifiedGroups } = determineBestThirds(groupResults, drawSeed);
  const thirdSlotMap = allocateBestThirds(qualifiedGroups);
  const thirdOf = (g: GroupLetter) => byGroup.get(g)![2].teamId;

  // Cruces hardcodeados según PDF
  const assignments: BracketAssignment[] = [
    { matchCode: "P73", homeTeamId: second("A"), awayTeamId: second("B") },
    {
      matchCode: "P74",
      homeTeamId: first("E"),
      awayTeamId: thirdOf(thirdSlotMap.get("P74")!),
    },
    { matchCode: "P75", homeTeamId: first("F"), awayTeamId: second("C") },
    { matchCode: "P76", homeTeamId: first("C"), awayTeamId: second("F") },
    {
      matchCode: "P77",
      homeTeamId: first("I"),
      awayTeamId: thirdOf(thirdSlotMap.get("P77")!),
    },
    { matchCode: "P78", homeTeamId: second("E"), awayTeamId: second("I") },
    {
      matchCode: "P79",
      homeTeamId: first("A"),
      awayTeamId: thirdOf(thirdSlotMap.get("P79")!),
    },
    {
      matchCode: "P80",
      homeTeamId: first("L"),
      awayTeamId: thirdOf(thirdSlotMap.get("P80")!),
    },
    {
      matchCode: "P81",
      homeTeamId: first("D"),
      awayTeamId: thirdOf(thirdSlotMap.get("P81")!),
    },
    {
      matchCode: "P82",
      homeTeamId: first("G"),
      awayTeamId: thirdOf(thirdSlotMap.get("P82")!),
    },
    { matchCode: "P83", homeTeamId: second("K"), awayTeamId: second("L") },
    { matchCode: "P84", homeTeamId: first("H"), awayTeamId: second("J") },
    {
      matchCode: "P85",
      homeTeamId: first("B"),
      awayTeamId: thirdOf(thirdSlotMap.get("P85")!),
    },
    { matchCode: "P86", homeTeamId: first("J"), awayTeamId: second("H") },
    {
      matchCode: "P87",
      homeTeamId: first("K"),
      awayTeamId: thirdOf(thirdSlotMap.get("P87")!),
    },
    { matchCode: "P88", homeTeamId: second("D"), awayTeamId: second("G") },
  ];

  return assignments;
}

/**
 * Bracket post-R32 (P89-P104): mapeo "Ganador P{n} vs Ganador P{m}".
 * Codifica el árbol de eliminación del PDF.
 */
export const POST_R32_TREE: Record<string, { home: string; away: string; loserHome?: boolean; loserAway?: boolean }> = {
  // Octavos: feeders son los 16 ganadores de R32
  P89: { home: "P74", away: "P77" },
  P90: { home: "P73", away: "P75" },
  P91: { home: "P76", away: "P78" },
  P92: { home: "P79", away: "P80" },
  P93: { home: "P83", away: "P84" },
  P94: { home: "P81", away: "P82" },
  P95: { home: "P86", away: "P88" },
  P96: { home: "P85", away: "P87" },
  // Cuartos
  P97: { home: "P89", away: "P90" },
  P98: { home: "P91", away: "P92" },
  P99: { home: "P93", away: "P94" },
  P100: { home: "P95", away: "P96" },
  // Semis
  P101: { home: "P97", away: "P98" },
  P102: { home: "P99", away: "P100" },
  // 3er puesto (perdedores de semis)
  P103: { home: "P101", away: "P102", loserHome: true, loserAway: true },
  // Final (ganadores de semis)
  P104: { home: "P101", away: "P102" },
};
