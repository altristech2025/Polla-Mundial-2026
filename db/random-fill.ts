/**
 * Prerelleno: pone marcadores aleatorios en la predicción de un usuario para
 * probar el flow sin tener que escribir 72 marcadores + 32 picks a mano.
 *
 * Uso: tsx --env-file=.env.local db/random-fill.ts [email]
 *   default email: ernesto.tassara@altristech.com
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const email = (process.argv[2] ?? "ernesto.tassara@altristech.com").toLowerCase().trim();

  const [user] = (await sql`select id from users where email = ${email}`) as Array<{ id: string }>;
  if (!user) {
    console.error(`No existe usuario con email ${email}`);
    process.exit(1);
  }
  const [pred] = (await sql`select id, status from predictions where user_id = ${user.id}`) as Array<{ id: string; status: string }>;
  if (!pred) {
    console.error(`No hay predicción para ${email}`);
    process.exit(1);
  }
  if (pred.status === "submitted") {
    console.error(`La predicción ya fue enviada, no puedo modificar.`);
    process.exit(1);
  }

  console.log(`Prerellenando predicción de ${email}…`);

  // Limpiar existente
  await sql`delete from prediction_group_scores where prediction_id = ${pred.id}`;
  await sql`delete from prediction_bracket_picks where prediction_id = ${pred.id}`;

  // === FASE DE GRUPOS ===
  const groupMatches = (await sql`
    select id, home_team_id, away_team_id from group_matches
  `) as Array<{ id: string; home_team_id: string; away_team_id: string }>;

  const rand = (max: number) => Math.floor(Math.random() * (max + 1));
  for (const m of groupMatches) {
    const hs = rand(4);
    const as = rand(4);
    await sql`
      insert into prediction_group_scores (prediction_id, group_match_id, home_score, away_score)
      values (${pred.id}, ${m.id}, ${hs}, ${as})
    `;
  }
  console.log(`  ✓ ${groupMatches.length} marcadores aleatorios insertados`);

  // === BRACKET ===
  // Para los 32 partidos, picamos un ganador aleatorio. Lo hacemos en orden
  // (R32 → R16 → ... → FINAL) para que las cascadas sean coherentes.
  // Para cada partido necesitamos saber sus participantes; para R32 los
  // computamos a partir de los marcadores; para los demás vienen del pick
  // anterior según POST_R32_TREE.

  // Importar dinámicamente la lógica de qualification (corre en TS via tsx)
  const { GROUPS, buildR32Bracket, POST_R32_TREE } = await import("../src/lib/qualification");
  const { computeGroupStandings } = await import("../src/lib/tiebreakers");

  const teams = (await sql`
    select id, group_letter, group_position from teams
  `) as Array<{ id: string; group_letter: string; group_position: number }>;
  const teamsByGroup = Object.fromEntries(
    GROUPS.map((g) => [g, teams.filter((t) => t.group_letter === g).map((t) => t.id)])
  ) as Record<string, string[]>;

  // Build my own group results to feed the bracket
  const myScores = new Map<string, { hs: number; as: number; home: string; away: string }>();
  const allScores = (await sql`
    select group_match_id, home_score, away_score
    from prediction_group_scores where prediction_id = ${pred.id}
  `) as Array<{ group_match_id: string; home_score: number; away_score: number }>;
  for (const s of allScores) {
    const m = groupMatches.find((x) => x.id === s.group_match_id)!;
    myScores.set(s.group_match_id, { hs: s.home_score, as: s.away_score, home: m.home_team_id, away: m.away_team_id });
  }

  const allGroupMatchesWithGroup = (await sql`
    select id, group_letter, home_team_id, away_team_id from group_matches
  `) as Array<{ id: string; group_letter: string; home_team_id: string; away_team_id: string }>;

  type GR = { group: string; standings: Array<{ teamId: string }> };
  const groupResults: GR[] = GROUPS.map((g) => {
    const gms = allGroupMatchesWithGroup.filter((m) => m.group_letter === g);
    const ms = gms.map((m) => {
      const s = myScores.get(m.id)!;
      return { homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: s.hs, awayScore: s.as };
    });
    return { group: g, standings: computeGroupStandings(teamsByGroup[g], ms, user.id) };
  });

  // Cast to expected type (lib expects GroupLetter)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r32 = buildR32Bracket(groupResults as any, user.id);

  // Map<matchCode, {home, away}>
  const participants = new Map<string, { home: string; away: string }>();
  for (const a of r32) participants.set(a.matchCode, { home: a.homeTeamId, away: a.awayTeamId });

  const pickOrder = [
    "P73","P74","P75","P76","P77","P78","P79","P80",
    "P81","P82","P83","P84","P85","P86","P87","P88",
    "P89","P90","P91","P92","P93","P94","P95","P96",
    "P97","P98","P99","P100",
    "P101","P102",
  ];
  const winners = new Map<string, string>();
  for (const code of pickOrder) {
    if (!participants.has(code)) {
      const tree = POST_R32_TREE[code];
      const homeFeed = winners.get(tree.home)!;
      const awayFeed = winners.get(tree.away)!;
      participants.set(code, { home: homeFeed, away: awayFeed });
    }
    const p = participants.get(code)!;
    const winner = Math.random() < 0.5 ? p.home : p.away;
    winners.set(code, winner);
    await sql`
      insert into prediction_bracket_picks (prediction_id, match_code, picked_winner_id)
      values (${pred.id}, ${code}, ${winner})
    `;
  }
  // P103 (3er puesto) — perdedores de P101 y P102
  const p101 = participants.get("P101")!;
  const p102 = participants.get("P102")!;
  const loser101 = winners.get("P101") === p101.home ? p101.away : p101.home;
  const loser102 = winners.get("P102") === p102.home ? p102.away : p102.home;
  const w103 = Math.random() < 0.5 ? loser101 : loser102;
  winners.set("P103", w103);
  await sql`
    insert into prediction_bracket_picks (prediction_id, match_code, picked_winner_id)
    values (${pred.id}, 'P103', ${w103})
  `;
  // P104 (final) — ganadores de P101 y P102
  const w101 = winners.get("P101")!;
  const w102 = winners.get("P102")!;
  const w104 = Math.random() < 0.5 ? w101 : w102;
  winners.set("P104", w104);
  await sql`
    insert into prediction_bracket_picks (prediction_id, match_code, picked_winner_id)
    values (${pred.id}, 'P104', ${w104})
  `;

  console.log(`  ✓ 32 picks de bracket aleatorios insertados`);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const winnerTeam = teamById.get(w104)!;
  console.log(`\n  🏆 Tu campeón aleatorio: ${winnerTeam.group_letter}${winnerTeam.group_position} (teamId ${w104})`);
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
