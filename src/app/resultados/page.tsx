/**
 * Página pública del torneo en vivo — formato Excel polla 2022.
 *
 * Layout: tabla única con 7 secciones por filas (Fase de grupos, Octavos,
 * Cuartos, Semifinal, 3°/4° puesto, Final, Campeón), columnas por pana
 * con sub-cols Pronóstico + PTOS, REAL al final, TOTAL en el footer.
 *
 * Mobile: vista alternativa con select de pana + secciones colapsables
 * (`<details>`). Misma fuente de verdad, distinta presentación.
 *
 * Reglas:
 * - Solo aparecen en la grilla los panas con `has_paid = true AND is_suspended = false`.
 *   - Los no pagadores aparecen solo como chip "Quién debe" arriba.
 *   - Los suspendidos aparecen solo como chip "Vetados por Huevones" arriba.
 * - **PRIVACIDAD PRE-KICKOFF**: mientras `now < tournament_start_at`,
 *   NUNCA se renderiza ningún equipo predicho, aunque el pana ya haya hecho
 *   submit. Cells vacías (`—`), TOTAL = 0, ranking alfabético con todos en 0.
 *   La fuente única de "no revelar" es `app_config.tournament_start_at`.
 * - Post-kickoff: revela picks, llena REAL con `official_*`, PTOS con scoring,
 *   columnas ordenadas desc por `total_score`, ranking actualizado.
 *
 * Bonus subcampeón: el bonus de 40 pts por acertar el subcampeón está
 * "rolled in" en la fila correspondiente de la sección Final (esa fila
 * mostraría 80 = 40 in-final + 40 subcampeón).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/countdown";
import { BrandLogo } from "@/components/brand-logo";
import { GROUPS, type GroupLetter } from "@/lib/qualification";
import {
  POINTS,
  type OfficialResults,
  type Prediction,
} from "@/lib/scoring";
import {
  buildOfficialResults,
  buildUserPrediction,
} from "@/lib/scoring-recompute";
import {
  R32_CODES,
  R16_CODES,
  QF_CODES,
  SF_CODES,
} from "@/lib/bracket-codes";
import { groupBy } from "@/lib/utils";

type ConfigRow = { tournament_start_at: string };

type UserRow = {
  id: string;
  display_name: string;
  has_paid: boolean;
  is_suspended: boolean;
  prediction_id: string | null;
  prediction_status: string | null;
  total_score: number | null;
};

type TeamRow = {
  id: string;
  code: string;
  name: string;
  flag_emoji: string | null;
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

type BracketMatchRow = {
  match_code: string;
  round: string;
  official_winner_id: string | null;
  official_loser_id: string | null;
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

/* ─────────────────────────── page ─────────────────────────── */

export default async function ResultadosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [config] = (await sql`
    select tournament_start_at from app_config where id = 1
  `) as unknown as ConfigRow[];
  const started = new Date(config.tournament_start_at).getTime() <= Date.now();

  const users = (await sql`
    select
      u.id, u.display_name, u.has_paid, u.is_suspended,
      p.id as prediction_id,
      p.status as prediction_status,
      p.total_score
    from users u
    left join predictions p on p.user_id = u.id
    order by u.display_name asc
  `) as unknown as UserRow[];

  const paidActive = users.filter((u) => u.has_paid && !u.is_suspended);
  const suspended = users.filter((u) => u.is_suspended);
  const unpaid = users.filter((u) => !u.has_paid && !u.is_suspended);

  // Orden columnas: alfabético pre-kickoff, desc score post-kickoff.
  const sortedPanas = [...paidActive].sort((a, b) => {
    if (started) {
      const ta = a.total_score ?? 0;
      const tb = b.total_score ?? 0;
      if (tb !== ta) return tb - ta;
    }
    return a.display_name.localeCompare(b.display_name);
  });

  /* PRIVACIDAD: solo se fetchean predicciones y se computan oficiales si
     ya empezó el Mundial. Pre-kickoff no se accede a nada de eso. */
  const predictionsByUser = new Map<string, Prediction>();
  const picksByUserAndCode = new Map<string, Map<string, string | null>>();
  const bracketMatchesByCode = new Map<string, BracketMatchRow>();
  let official: OfficialResults | null = null;
  let teamById = new Map<string, TeamRow>();
  let teamsByGroupLetter: Record<GroupLetter, TeamRow[]> = {} as Record<
    GroupLetter,
    TeamRow[]
  >;

  if (started) {
    const [teams, groupMatches, bracketMatches] = (await Promise.all([
      sql`
        select id, code, name, flag_emoji, group_letter, group_position
        from teams order by group_letter, group_position
      `,
      sql`
        select id, group_letter, home_team_id, away_team_id,
               official_home_score, official_away_score
        from group_matches
      `,
      sql`
        select match_code, round, official_winner_id, official_loser_id
        from bracket_matches
      `,
    ])) as unknown as [TeamRow[], GroupMatchRow[], BracketMatchRow[]];

    teamById = new Map(teams.map((t) => [t.id, t]));
    teamsByGroupLetter = Object.fromEntries(
      GROUPS.map((g) => [g, teams.filter((t) => t.group_letter === g)])
    ) as Record<GroupLetter, TeamRow[]>;
    const teamIdsByGroup = Object.fromEntries(
      GROUPS.map((g) => [g, teamsByGroupLetter[g].map((t) => t.id)])
    ) as Record<GroupLetter, string[]>;
    for (const b of bracketMatches) bracketMatchesByCode.set(b.match_code, b);

    official = buildOfficialResults(teamIdsByGroup, groupMatches, bracketMatches);

    const paidPredIds = paidActive
      .map((u) => u.prediction_id)
      .filter(Boolean) as string[];

    if (paidPredIds.length > 0) {
      const [allScores, allPicks] = (await Promise.all([
        sql`
          select prediction_id, group_match_id, home_score, away_score
          from prediction_group_scores
          where prediction_id = any(${paidPredIds})
        `,
        sql`
          select prediction_id, match_code, picked_winner_id
          from prediction_bracket_picks
          where prediction_id = any(${paidPredIds})
        `,
      ])) as unknown as [PredScoreRow[], PredPickRow[]];

      const scoresByPred = groupBy(allScores, (r) => r.prediction_id);
      const picksByPred = groupBy(allPicks, (r) => r.prediction_id);

      for (const u of paidActive) {
        if (!u.prediction_id) continue;
        const userScores = scoresByPred.get(u.prediction_id) ?? [];
        const userPicks = picksByPred.get(u.prediction_id) ?? [];
        const pred = buildUserPrediction(
          u.id,
          userScores,
          userPicks,
          teamIdsByGroup,
          groupMatches
        );
        predictionsByUser.set(u.id, pred);
        const pickMap = new Map<string, string | null>();
        for (const p of userPicks) pickMap.set(p.match_code, p.picked_winner_id);
        picksByUserAndCode.set(u.id, pickMap);
      }
    }
  }

  // Real R32: cada (grupo, slot) → teamId real, cruzando r32Positions con teamById.
  const realR32: Record<GroupLetter, [string | null, string | null, string | null]> =
    Object.fromEntries(
      GROUPS.map((g) => [g, [null, null, null] as [null, null, null]])
    ) as Record<GroupLetter, [string | null, string | null, string | null]>;
  if (started && official) {
    for (const [teamId, pos] of official.r32Positions) {
      const t = teamById.get(teamId);
      if (!t) continue;
      const slotIdx = pos - 1;
      if (slotIdx >= 0 && slotIdx <= 2) {
        realR32[t.group_letter as GroupLetter][slotIdx] = teamId;
      }
    }
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-10 sm:py-12">
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
                Resultados del Mundial 2026
              </p>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold">
                {started ? "Cómo va la polla" : "El Mundial está por arrancar"}
              </h1>
              <p className="mt-2 text-muted max-w-2xl text-sm">
                {started
                  ? "Cada pana tiene una columna con su pronóstico y los puntos ganados. La columna REAL al final muestra lo que está pasando. El ranking se actualiza con cada partido oficial."
                  : "Cuando arranque el Mundial, las casillas se llenan con la predicción de cada uno y el puntaje en vivo. Hasta entonces no se revela nada — todos arrancamos en 0."}
              </p>
            </div>
          </div>
          <Link href="/mi-polla">
            <Button variant="ghost" size="sm">Mi polla</Button>
          </Link>
        </header>

        {!started && (
          <Countdown
            targetIso={config.tournament_start_at}
            label="Falta para el kickoff del Mundial"
          />
        )}

        <ChipsBar suspended={suspended} unpaid={unpaid} />

        {/* Ranking arriba en mobile (resumen rápido), abajo en desktop */}
        <div className="lg:hidden">
          <RankingSection panas={sortedPanas} started={started} />
        </div>

        {sortedPanas.length === 0 ? (
          <Card className="text-center text-muted text-sm py-10">
            Todavía nadie ha pagado y está activo en la polla.
          </Card>
        ) : (
          <>
            {/* Desktop: tabla completa */}
            <div className="hidden lg:block">
              <DesktopTable
                panas={sortedPanas}
                teamById={teamById}
                teamsByGroupLetter={teamsByGroupLetter}
                predictionsByUser={predictionsByUser}
                picksByUserAndCode={picksByUserAndCode}
                official={official}
                bracketByCode={bracketMatchesByCode}
                realR32={realR32}
                started={started}
              />
            </div>

            {/* Mobile: select + vista colapsable por pana */}
            <div className="lg:hidden">
              <MobileView
                panas={sortedPanas}
                teamById={teamById}
                teamsByGroupLetter={teamsByGroupLetter}
                predictionsByUser={predictionsByUser}
                picksByUserAndCode={picksByUserAndCode}
                official={official}
                bracketByCode={bracketMatchesByCode}
                realR32={realR32}
                started={started}
              />
            </div>
          </>
        )}

        {/* Ranking abajo en desktop */}
        <div className="hidden lg:block">
          <RankingSection panas={sortedPanas} started={started} />
        </div>
      </div>
    </main>
  );
}

/* ─────────────────────────── chips ─────────────────────────── */

function ChipsBar({
  suspended,
  unpaid,
}: {
  suspended: UserRow[];
  unpaid: UserRow[];
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Card className="bg-error/5 border-error/30">
        <p className="text-xs uppercase tracking-widest text-error font-mono">
          Vetados por Huevones
        </p>
        <p className="mt-1 text-xs text-muted">
          Retirados momentáneamente por el admin. Sus puntos quedan congelados
          mientras estén afuera; vuelven cuando se porten bien.
        </p>
        {suspended.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {suspended.map((u) => (
              <li
                key={u.id}
                className="rounded-full border border-error/30 bg-error/10 px-3 py-1 text-sm text-error"
              >
                {u.display_name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted italic">
            Nadie retirado por ahora. Pórtense bien.
          </p>
        )}
      </Card>
      {unpaid.length > 0 && (
        <Card className="bg-warning/5 border-warning/30">
          <p className="text-xs uppercase tracking-widest text-warning font-mono">
            Quién debe
          </p>
          <p className="mt-1 text-xs text-muted">
            Si no pagan antes del kickoff, no participan de la polla.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unpaid.map((u) => (
              <li
                key={u.id}
                className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-sm text-warning"
              >
                {u.display_name}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────── shared layout types ─────────────────────────── */

type SharedProps = {
  panas: UserRow[];
  teamById: Map<string, TeamRow>;
  teamsByGroupLetter: Record<GroupLetter, TeamRow[]>;
  predictionsByUser: Map<string, Prediction>;
  picksByUserAndCode: Map<string, Map<string, string | null>>;
  official: OfficialResults | null;
  bracketByCode: Map<string, BracketMatchRow>;
  realR32: Record<GroupLetter, [string | null, string | null, string | null]>;
  started: boolean;
};

type SectionRow = {
  label: string;
  predicted: (userId: string) => string | null;
  real: () => string | null;
  /** points por team predicho (0 si no aplica) */
  pts: (teamId: string | null) => number;
};

type Section = {
  id: string;
  title: string;
  rows: SectionRow[];
};

function buildSections(props: SharedProps): Section[] {
  const {
    teamsByGroupLetter,
    predictionsByUser,
    picksByUserAndCode,
    official,
    bracketByCode,
    realR32,
    started,
  } = props;

  // Privacy gate: pre-kickoff returns null/0 para no revelar predicciones.
  const safe = <T,>(fallback: T, fn: () => T): (() => T) => () => started ? fn() : fallback;
  const safeUser = <T,>(fallback: T, fn: (uid: string) => T): ((uid: string) => T) =>
    (uid) => (started ? fn(uid) : fallback);

  // Helper para secciones de bracket lineales (R16/QF/SF): cada code → un pick.
  const buildBracketRows = (
    codes: readonly string[],
    teamSet: Set<string> | undefined,
    points: number
  ): SectionRow[] =>
    codes.map((code, i) => ({
      label: `${i + 1}`,
      predicted: safeUser(null, (uid) => picksByUserAndCode.get(uid)?.get(code) ?? null),
      real: safe(null, () => bracketByCode.get(code)?.official_winner_id ?? null),
      pts: (teamId) =>
        started && teamId && teamSet?.has(teamId) ? points : 0,
    }));

  // R32 (fase de grupos): 12 × 3 slots, con bonus por posición exacta.
  const r32Rows: SectionRow[] = [];
  for (const g of GROUPS) {
    for (let slotIdx = 0; slotIdx <= 2; slotIdx++) {
      const wantedPos = (slotIdx + 1) as 1 | 2 | 3;
      r32Rows.push({
        label: `Grupo ${g} · ${wantedPos}°`,
        predicted: safeUser(null, (uid) => {
          const pred = predictionsByUser.get(uid);
          if (!pred) return null;
          for (const t of teamsByGroupLetter[g] ?? []) {
            if (pred.predictedR32.get(t.id) === wantedPos) return t.id;
          }
          return null;
        }),
        real: safe(null, () => realR32[g]?.[slotIdx] ?? null),
        pts: (teamId) => {
          if (!started || !official || !teamId) return 0;
          const actualPos = official.r32Positions.get(teamId);
          if (actualPos === undefined) return 0;
          return POINTS.R32_PASS + (actualPos === wantedPos ? POINTS.R32_POSITION_BONUS : 0);
        },
      });
    }
  }

  const r16Rows = buildBracketRows(R32_CODES, official?.r16Teams, POINTS.R16);
  const qfRows = buildBracketRows(R16_CODES, official?.qfTeams, POINTS.QF);
  const sfRows = buildBracketRows(QF_CODES, official?.sfTeams, POINTS.SF);

  const thirdRows: SectionRow[] = [
    {
      label: "Tercer puesto",
      predicted: safeUser(null, (uid) => picksByUserAndCode.get(uid)?.get("P103") ?? null),
      real: safe(null, () => official?.thirdId ?? null),
      pts: (teamId) => (started && teamId === official?.thirdId ? POINTS.THIRD : 0),
    },
    {
      label: "Cuarto puesto",
      predicted: safeUser(null, (uid) => predictionsByUser.get(uid)?.predictedFourth ?? null),
      real: safe(null, () => official?.fourthId ?? null),
      pts: (teamId) => (started && teamId === official?.fourthId ? POINTS.FOURTH : 0),
    },
  ];

  // Final: cada fila puede sumar 40 (finalista) + 40 extra si ese team es además el
  // subcampeón real. El bonus de subcampeón está "rolled in" acá; no hay sección aparte.
  const finalRows: SectionRow[] = SF_CODES.map((code, i) => ({
    label: `Finalista ${i + 1}`,
    predicted: safeUser(null, (uid) => picksByUserAndCode.get(uid)?.get(code) ?? null),
    real: safe(null, () => bracketByCode.get(code)?.official_winner_id ?? null),
    pts: (teamId) => {
      if (!started || !official || !teamId) return 0;
      let pts = 0;
      if (official.finalTeams.has(teamId)) pts += POINTS.FINAL;
      if (teamId === official.runnerUpId) pts += POINTS.RUNNER_UP;
      return pts;
    },
  }));

  const champRows: SectionRow[] = [
    {
      label: "Campeón",
      predicted: safeUser(null, (uid) => picksByUserAndCode.get(uid)?.get("P104") ?? null),
      real: safe(null, () => official?.championId ?? null),
      pts: (teamId) => (started && teamId === official?.championId ? POINTS.CHAMPION : 0),
    },
  ];

  return [
    { id: "r32", title: "Fase de grupos", rows: r32Rows },
    { id: "r16", title: "Octavos (R16)", rows: r16Rows },
    { id: "qf", title: "Cuartos (QF)", rows: qfRows },
    { id: "sf", title: "Semifinal", rows: sfRows },
    { id: "third", title: "Tercer y Cuarto puesto", rows: thirdRows },
    { id: "final", title: "Final", rows: finalRows },
    { id: "champion", title: "Campeón", rows: champRows },
  ];
}

function computeTotalForUser(userId: string, sections: Section[]): number {
  let total = 0;
  for (const sec of sections) {
    for (const row of sec.rows) {
      const team = row.predicted(userId);
      total += row.pts(team);
    }
  }
  return total;
}

/* ─────────────────────────── desktop table ─────────────────────────── */

function DesktopTable(props: SharedProps) {
  const sections = buildSections(props);
  const totals = new Map<string, number>(
    props.panas.map((u) => [u.id, computeTotalForUser(u.id, sections)])
  );

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <p className="text-xs uppercase tracking-widest text-accent font-mono">
          Pronóstico vs realidad
        </p>
        <h2 className="mt-2 text-lg font-bold">Tablero completo</h2>
        <p className="mt-1 text-sm text-muted">
          {props.panas.length} pana{props.panas.length === 1 ? "" : "s"} en juego.
          Última columna = lo que está pasando en el Mundial.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 bg-surface border-b border-border border-r border-border px-3 py-3 text-left text-[10px] uppercase tracking-widest text-muted font-mono min-w-[180px]"
              >
                Sección / fila
              </th>
              {props.panas.map((u) => (
                <th
                  key={u.id}
                  colSpan={2}
                  className="bg-surface border-b border-border border-l border-border px-3 py-3 text-center min-w-[160px]"
                >
                  <div className="text-sm font-bold text-foreground">
                    {u.display_name}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-success font-mono">
                    ✓ pagó
                  </div>
                </th>
              ))}
              <th
                rowSpan={2}
                className="sticky right-0 z-20 bg-surface border-b border-border border-l-2 border-accent/40 px-3 py-3 text-center min-w-[110px] text-xs uppercase tracking-widest text-accent font-mono"
              >
                REAL
              </th>
            </tr>
            <tr>
              {props.panas.flatMap((u) => [
                <th
                  key={u.id + "-p"}
                  className="bg-surface border-b border-border border-l border-border px-2 py-2 text-[10px] uppercase tracking-widest text-muted font-mono"
                >
                  Pronóstico
                </th>,
                <th
                  key={u.id + "-pts"}
                  className="bg-surface border-b border-border px-2 py-2 text-[10px] uppercase tracking-widest text-muted font-mono"
                >
                  PTOS
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <SectionRows key={sec.id} section={sec} panas={props.panas} teamById={props.teamById} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky left-0 z-10 bg-surface border-t-2 border-accent/40 border-r border-border px-3 py-4 text-left text-xs uppercase tracking-widest text-accent font-mono">
                TOTAL
              </th>
              {props.panas.flatMap((u) => [
                <td
                  key={u.id + "-tp"}
                  className="bg-surface border-t-2 border-accent/40 border-l border-border px-2 py-4 text-muted text-xs"
                />,
                <td
                  key={u.id + "-tt"}
                  className="bg-surface border-t-2 border-accent/40 px-2 py-4 text-center"
                >
                  <span className="text-lg font-bold tabular-nums text-accent">
                    {totals.get(u.id) ?? 0}
                  </span>
                </td>,
              ])}
              <td className="sticky right-0 z-10 bg-surface border-t-2 border-accent/40 border-l-2 border-accent/40 px-3 py-4" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

function SectionRows({
  section,
  panas,
  teamById,
}: {
  section: Section;
  panas: UserRow[];
  teamById: Map<string, TeamRow>;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={2 + panas.length * 2 + 1}
          className="sticky left-0 bg-accent/[0.06] border-y border-accent/30 px-3 py-2 text-[11px] uppercase tracking-widest text-accent font-mono font-bold"
        >
          {section.title}
        </td>
      </tr>
      {section.rows.map((row, idx) => (
        <tr key={row.label} className={idx % 2 === 1 ? "bg-background" : ""}>
          <td className="sticky left-0 z-10 bg-inherit border-b border-border/40 border-r border-border px-3 py-2 text-xs text-muted font-mono">
            {row.label}
          </td>
          {panas.flatMap((u) => {
            const teamId = row.predicted(u.id);
            const pts = row.pts(teamId);
            return [
              <td
                key={`${u.id}-${row.label}-p`}
                className="border-b border-border/40 border-l border-border px-2 py-2 text-center"
              >
                <TeamCell teamId={teamId} teamById={teamById} />
              </td>,
              <td
                key={`${u.id}-${row.label}-pts`}
                className="border-b border-border/40 px-2 py-2 text-center"
              >
                <PtsCell value={pts} />
              </td>,
            ];
          })}
          <td className="sticky right-0 z-10 bg-inherit border-b border-border/40 border-l-2 border-accent/40 px-3 py-2 text-center">
            <TeamCell teamId={row.real()} teamById={teamById} />
          </td>
        </tr>
      ))}
    </>
  );
}

/* ─────────────────────────── mobile view ─────────────────────────── */

function MobileView(props: SharedProps) {
  const sections = buildSections(props);
  // No state-driven selector en RSC: usamos <details>/<summary> nativos para
  // que cada pana sea su propio bloque colapsable. Primera abierta por default.
  const totals = new Map<string, number>(
    props.panas.map((u) => [u.id, computeTotalForUser(u.id, sections)])
  );

  if (props.panas.length === 0) return null;

  return (
    <div className="space-y-3">
      {props.panas.map((u, idx) => (
        <details
          key={u.id}
          open={idx === 0}
          className="rounded-2xl border border-border bg-surface overflow-hidden group"
        >
          <summary className="px-5 py-4 cursor-pointer flex items-center justify-between gap-3 list-none">
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-xs text-muted tabular-nums">
                #{idx + 1}
              </span>
              <span className="font-bold truncate">{u.display_name}</span>
              <span className="text-[10px] uppercase tracking-widest text-success font-mono whitespace-nowrap">
                ✓ pagó
              </span>
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-lg font-bold tabular-nums text-accent">
                {totals.get(u.id) ?? 0}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted font-mono">
                pts
              </span>
              <span className="text-muted transition-transform group-open:rotate-180">▾</span>
            </div>
          </summary>
          <div className="border-t border-border divide-y divide-border/40">
            {sections.map((sec) => (
              <MobilePanaSection
                key={sec.id}
                section={sec}
                userId={u.id}
                teamById={props.teamById}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function MobilePanaSection({
  section,
  userId,
  teamById,
}: {
  section: Section;
  userId: string;
  teamById: Map<string, TeamRow>;
}) {
  return (
    <details open className="bg-background">
      <summary className="px-5 py-3 cursor-pointer flex items-center justify-between gap-2 list-none">
        <span className="text-xs uppercase tracking-widest text-accent font-mono font-bold">
          {section.title}
        </span>
        <span className="text-muted text-xs">▾</span>
      </summary>
      <ul className="divide-y divide-border/40">
        {section.rows.map((row) => {
          const teamId = row.predicted(userId);
          const real = row.real();
          const pts = row.pts(teamId);
          return (
            <li
              key={row.label}
              className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-xs text-muted font-mono whitespace-nowrap min-w-[80px]">
                {row.label}
              </span>
              <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                <div className="flex items-center gap-1 text-xs min-w-0">
                  <TeamCell teamId={teamId} teamById={teamById} />
                </div>
                <span className="text-muted">·</span>
                <span className="tabular-nums font-mono text-xs">
                  <PtsCell value={pts} />
                </span>
                <span className="text-muted">→</span>
                <div className="flex items-center gap-1 text-xs min-w-0">
                  <TeamCell teamId={real} teamById={teamById} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/* ─────────────────────────── ranking ─────────────────────────── */

function RankingSection({
  panas,
  started,
}: {
  panas: UserRow[];
  started: boolean;
}) {
  // Pre-kickoff: orden alfabético (mismo que panas viene), todos en 0.
  // Post-kickoff: desc por total_score, tiebreak alfa (mismo que panas viene).
  if (panas.length === 0) return null;
  return (
    <Card>
      <p className="text-xs uppercase tracking-widest text-accent font-mono">
        Ranking
      </p>
      <h2 className="mt-2 text-lg font-bold">Top de la polla</h2>
      <p className="mt-1 text-sm text-muted">
        {started
          ? "Solo participan los que pagaron y están activos. Orden por puntos acumulados."
          : "Todos arrancamos en 0. El orden se activa cuando empiece el Mundial."}
      </p>
      <ol className="mt-4 divide-y divide-border">
        {panas.map((u, i) => {
          const medalBg =
            !started
              ? "bg-surface-elevated text-muted"
              : i === 0
              ? "bg-accent text-accent-foreground"
              : i === 1
              ? "bg-foreground/15 text-foreground"
              : i === 2
              ? "bg-warning/20 text-warning"
              : "bg-surface-elevated text-muted";
          return (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    "inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold font-mono " +
                    medalBg
                  }
                >
                  {i + 1}
                </span>
                <span className="font-medium">{u.display_name}</span>
              </div>
              <span className="font-mono tabular-nums text-lg font-bold">
                {started ? u.total_score ?? 0 : 0}{" "}
                <span className="text-xs text-muted">pts</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ─────────────────────────── shared cells ─────────────────────────── */

function TeamCell({
  teamId,
  teamById,
}: {
  teamId: string | null;
  teamById: Map<string, TeamRow>;
}) {
  if (!teamId) {
    return <span className="text-muted">—</span>;
  }
  const t = teamById.get(teamId);
  if (!t) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-base">{t.flag_emoji ?? ""}</span>
      <span className="font-mono">{t.code}</span>
    </span>
  );
}

function PtsCell({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted text-xs">—</span>;
  return (
    <span className="font-mono font-bold tabular-nums text-accent text-sm">
      {value}
    </span>
  );
}

