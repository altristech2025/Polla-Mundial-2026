/**
 * Reseed: reemplaza los placeholders de equipos + partidos por datos reales del
 * sorteo oficial FIFA 2026, parseados desde /tmp/wc-data.json (Wikipedia ES).
 *
 * Borra: prediction_*, group_matches, teams (en ese orden por FKs).
 * Mantiene: bracket_matches (estructura P73-P104 con slot_spec del PDF).
 * Mantiene: users, allowed_participants, app_config.
 *
 * Idempotente: re-correr siempre llega al mismo estado final.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const TEAM_NAMES: Record<string, string> = {
  MEX: "México", RSA: "Sudáfrica", KOR: "Corea del Sur", CZE: "República Checa",
  CAN: "Canadá", BIH: "Bosnia y Herzegovina", QAT: "Catar", SUI: "Suiza",
  BRA: "Brasil", MAR: "Marruecos", HAI: "Haití", SCO: "Escocia",
  USA: "Estados Unidos", PAR: "Paraguay", AUS: "Australia", TUR: "Turquía",
  GER: "Alemania", CUW: "Curazao", CIV: "Costa de Marfil", ECU: "Ecuador",
  NED: "Países Bajos", JPN: "Japón", SWE: "Suecia", TUN: "Túnez",
  BEL: "Bélgica", EGY: "Egipto", IRN: "Irán", NZL: "Nueva Zelanda",
  ESP: "España", CPV: "Cabo Verde", KSA: "Arabia Saudita", URU: "Uruguay",
  FRA: "Francia", SEN: "Senegal", IRQ: "Irak", NOR: "Noruega",
  ARG: "Argentina", ALG: "Argelia", AUT: "Austria", JOR: "Jordania",
  POR: "Portugal", COD: "República Democrática del Congo", UZB: "Uzbekistán", COL: "Colombia",
  ENG: "Inglaterra", CRO: "Croacia", GHA: "Ghana", PAN: "Panamá",
};

type WCData = {
  groups: Record<string, string[]>;
  matches: Array<{
    group: string;
    p: number;
    date: string;
    home_code: string;
    home_name: string;
    away_code: string;
    away_name: string;
    venue: string;
    city: string;
  }>;
  iso3_to_flag: Record<string, string>;
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const data: WCData = JSON.parse(readFileSync("/tmp/wc-data.json", "utf-8"));

  console.log("Reseeding DB with real FIFA 2026 data...");

  // 1. Limpiar en orden inverso a FKs
  await sql`delete from prediction_final_order`;
  await sql`delete from prediction_bracket_picks`;
  await sql`delete from prediction_group_scores`;
  // Bracket: clear team refs antes de borrar teams
  await sql`
    update bracket_matches set
      official_home_team_id = null,
      official_away_team_id = null,
      official_winner_id = null,
      official_loser_id = null
  `;
  await sql`delete from group_matches`;
  await sql`delete from teams`;
  console.log("  ✓ tablas limpiadas");

  // 2. Insertar 48 equipos con posición = orden Wikipedia
  const teamIdByCode: Record<string, string> = {};
  for (const [letter, codes] of Object.entries(data.groups)) {
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      const name = TEAM_NAMES[code] ?? code;
      const flag = data.iso3_to_flag[code] ?? "";
      const inserted = (await sql`
        insert into teams (code, name, flag_emoji, group_letter, group_position, is_placeholder)
        values (${code}, ${name}, ${flag}, ${letter}, ${i + 1}, false)
        returning id
      `) as Array<{ id: string }>;
      teamIdByCode[code] = inserted[0].id;
    }
  }
  console.log(`  ✓ ${Object.keys(teamIdByCode).length} equipos insertados`);

  // 3. Insertar partidos. match_day se deriva ordenando los 6 partidos del grupo
  //    por fecha: las primeras 2 = MD1, siguientes 2 = MD2, últimas 2 = MD3.
  let inserted = 0;
  for (const letter of Object.keys(data.groups)) {
    const groupMatches = data.matches
      .filter((m) => m.group === letter)
      .sort((a, b) => a.date.localeCompare(b.date) || a.p - b.p);
    for (let i = 0; i < groupMatches.length; i++) {
      const m = groupMatches[i];
      const matchDay = Math.floor(i / 2) + 1; // 0,1→MD1; 2,3→MD2; 4,5→MD3
      const homeId = teamIdByCode[m.home_code];
      const awayId = teamIdByCode[m.away_code];
      if (!homeId || !awayId) {
        console.warn(`  ⚠ no IDs for ${m.home_code}/${m.away_code} in P${m.p}`);
        continue;
      }
      await sql`
        insert into group_matches (group_letter, match_day, match_date, home_team_id, away_team_id)
        values (${letter}, ${matchDay}, ${m.date}, ${homeId}, ${awayId})
      `;
      inserted++;
    }
  }
  console.log(`  ✓ ${inserted} partidos de grupos insertados`);

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
