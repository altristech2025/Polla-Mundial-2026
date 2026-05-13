/**
 * Página pública del torneo en vivo.
 * - Antes del kickoff (app_config.tournament_start_at): casillas vacías.
 *   Solo se ve quién pagó y quién debe.
 * - Desde el kickoff: casillas se llenan con la predicción de cada pagador
 *   (3 slots por grupo: 1º, 2º y "mejor tercero" si la predicción lo deriva),
 *   espejo con la situación real proyectada (live), puntos y ranking.
 *
 * Reglas:
 * - Solo pagadores aparecen en la grilla y en el ranking. Los no pagadores
 *   solo se listan en una sección aparte (quién debe).
 * - Real se proyecta con los partidos jugados (los que tengan
 *   official_home_score / official_away_score). Si todos los grupos están
 *   completos en lo oficial, también se calcula la fila "tercer mejor" real.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/countdown";
import { BrandLogo } from "@/components/brand-logo";
import {
  GROUPS,
  determineBestThirds,
  type GroupLetter,
  type GroupResult,
} from "@/lib/qualification";
import { computeGroupStandings } from "@/lib/tiebreakers";
import { groupBy } from "@/lib/utils";

type ConfigRow = { tournament_start_at: string };

type UserRow = {
  id: string;
  display_name: string;
  has_paid: boolean;
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

type PredScoreRow = {
  prediction_id: string;
  group_match_id: string;
  home_score: number;
  away_score: number;
};

type SlotTeamIds = Record<GroupLetter, [string | null, string | null, string | null]>;

export default async function ResultadosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [config] = (await sql`
    select tournament_start_at from app_config where id = 1
  `) as unknown as ConfigRow[];

  const started = new Date(config.tournament_start_at).getTime() <= Date.now();

  const users = (await sql`
    select
      u.id, u.display_name, u.has_paid,
      p.id as prediction_id,
      p.status as prediction_status,
      p.total_score
    from users u
    left join predictions p on p.user_id = u.id
    order by u.display_name asc
  `) as unknown as UserRow[];

  const paidUsers = users.filter((u) => u.has_paid);
  const unpaidUsers = users.filter((u) => !u.has_paid);

  const teams = (await sql`
    select id, code, name, flag_emoji, group_letter, group_position
    from teams order by group_letter, group_position
  `) as unknown as TeamRow[];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamsByGroup: Record<GroupLetter, string[]> = Object.fromEntries(
    GROUPS.map((g) => [g, teams.filter((t) => t.group_letter === g).map((t) => t.id)])
  ) as Record<GroupLetter, string[]>;

  const groupMatches = (await sql`
    select id, group_letter, home_team_id, away_team_id,
           official_home_score, official_away_score
    from group_matches
  `) as unknown as GroupMatchRow[];
  const groupMatchesByGroup = new Map<GroupLetter, GroupMatchRow[]>();
  for (const g of GROUPS) {
    groupMatchesByGroup.set(g, groupMatches.filter((m) => m.group_letter === g));
  }

  // Predicciones de los pagadores (no traemos de los demás, no se usan)
  const paidPredIds = paidUsers.map((u) => u.prediction_id).filter(Boolean) as string[];
  const allScores =
    paidPredIds.length > 0
      ? ((await sql`
          select prediction_id, group_match_id, home_score, away_score
          from prediction_group_scores
          where prediction_id = any(${paidPredIds})
        `) as unknown as PredScoreRow[])
      : [];
  const scoresByPred = groupBy(allScores, (r) => r.prediction_id);

  // --- Slots predichos por usuario (solo si arrancó el Mundial) ---
  const predictedSlotsByUser = new Map<string, SlotTeamIds>();
  if (started) {
    for (const u of paidUsers) {
      if (!u.prediction_id) continue;
      const userScores = scoresByPred.get(u.prediction_id) ?? [];
      const slots = computePredictedSlots(
        u.id,
        userScores,
        groupMatchesByGroup,
        teamsByGroup
      );
      if (slots) predictedSlotsByUser.set(u.id, slots);
    }
  }

  // --- Slots reales (compartidos) — proyección live desde official_* ---
  const realSlots: SlotTeamIds | null = started
    ? computeRealSlots(groupMatchesByGroup, teamsByGroup)
    : null;

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
                Resultados del Mundial 2026
              </p>
              <h1 className="mt-2 text-3xl font-bold">
                {started ? "Cómo va la polla" : "El Mundial está por arrancar"}
              </h1>
              <p className="mt-2 text-muted max-w-2xl">
                {started
                  ? "Cada columna es un pana del bolo. Predicción a la izquierda, lo que está pasando en la realidad a la derecha. El ranking se actualiza con cada partido oficial."
                  : "Lo que cada uno predijo + lo que vaya pasando en el Mundial aparece acá desde el kickoff. Mientras tanto, asegúrate de pagar tu polla."}
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

        {unpaidUsers.length > 0 && (
          <Card>
            <p className="text-xs uppercase tracking-widest text-warning font-mono">
              Pendientes de pago
            </p>
            <h2 className="mt-2 text-lg font-bold">Quién debe</h2>
            <p className="mt-1 text-sm text-muted">
              Estos panas todavía no han pagado. Si no pagan antes del kickoff, no
              participan del bolo.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {unpaidUsers.map((u) => (
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

        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-border">
            <p className="text-xs uppercase tracking-widest text-accent font-mono">
              Tracking
            </p>
            <h2 className="mt-2 text-lg font-bold">
              Predicción vs realidad — fase de grupos
            </h2>
            <p className="mt-1 text-sm text-muted">
              {paidUsers.length} pana{paidUsers.length === 1 ? "" : "s"} en el bolo.
              Cada grupo tiene 3 casillas (1° y 2° pasan directo; la 3° solo se
              llena si esa selección queda entre los 8 mejores terceros).
            </p>
          </div>

          {paidUsers.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted text-sm">
              Todavía nadie ha pagado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <ResultsTable
                paidUsers={paidUsers}
                teamById={teamById}
                predictedSlotsByUser={predictedSlotsByUser}
                realSlots={realSlots}
                started={started}
              />
            </div>
          )}
        </Card>

        {started && paidUsers.length > 0 && (
          <Card>
            <p className="text-xs uppercase tracking-widest text-accent font-mono">
              Ranking
            </p>
            <h2 className="mt-2 text-lg font-bold">Top del bolo</h2>
            <p className="mt-1 text-sm text-muted">
              Solo participan los que pagaron y enviaron su pronóstico. Orden por
              puntos acumulados.
            </p>
            <Ranking paidUsers={paidUsers} />
          </Card>
        )}
      </div>
    </main>
  );
}

/* ---------------- table ---------------- */

function ResultsTable({
  paidUsers,
  teamById,
  predictedSlotsByUser,
  realSlots,
  started,
}: {
  paidUsers: UserRow[];
  teamById: Map<string, TeamRow>;
  predictedSlotsByUser: Map<string, SlotTeamIds>;
  realSlots: SlotTeamIds | null;
  started: boolean;
}) {
  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead>
        <tr>
          <th className="sticky left-0 z-10 bg-surface border-b border-border px-3 py-3 text-left text-[10px] uppercase tracking-widest text-muted font-mono min-w-[80px]">
            Grupo
          </th>
          {paidUsers.map((u) => (
            <th
              key={u.id}
              colSpan={2}
              className="bg-surface border-b border-border border-l border-border px-3 py-3 text-center min-w-[180px]"
            >
              <div className="text-sm font-bold text-foreground">{u.display_name}</div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-success font-mono">
                ✓ pagó
              </div>
            </th>
          ))}
        </tr>
        <tr>
          <th className="sticky left-0 z-10 bg-surface border-b border-border px-3 py-2 text-left text-[10px] uppercase tracking-widest text-muted font-mono">
            slot
          </th>
          {paidUsers.flatMap((u) => [
            <th
              key={u.id + "-pred"}
              className="bg-surface border-b border-border border-l border-border px-2 py-2 text-[10px] uppercase tracking-widest text-muted font-mono w-[90px]"
            >
              Predicho
            </th>,
            <th
              key={u.id + "-real"}
              className="bg-surface border-b border-border px-2 py-2 text-[10px] uppercase tracking-widest text-accent font-mono w-[90px]"
            >
              Real
            </th>,
          ])}
        </tr>
      </thead>
      <tbody>
        {GROUPS.flatMap((g) =>
          ([0, 1, 2] as const).map((slotIdx) => (
            <tr
              key={`${g}-${slotIdx}`}
              className={slotIdx === 0 ? "border-t-2 border-border" : ""}
            >
              <td className="sticky left-0 z-10 bg-background border-b border-border/40 px-3 py-2 font-mono text-xs">
                {slotIdx === 0 ? (
                  <span className="font-bold text-foreground">{g}</span>
                ) : (
                  <span className="text-muted">{g}</span>
                )}
                <span className="ml-1 text-muted">·{slotIdx + 1}</span>
              </td>
              {paidUsers.flatMap((u) => {
                const predTeamId = started
                  ? predictedSlotsByUser.get(u.id)?.[g]?.[slotIdx] ?? null
                  : null;
                const realTeamId = realSlots?.[g]?.[slotIdx] ?? null;
                return [
                  <td
                    key={`${u.id}-${g}-${slotIdx}-pred`}
                    className="border-b border-border/40 border-l border-border px-2 py-2 text-center"
                  >
                    <TeamCell teamId={predTeamId} teamById={teamById} />
                  </td>,
                  <td
                    key={`${u.id}-${g}-${slotIdx}-real`}
                    className="border-b border-border/40 px-2 py-2 text-center bg-accent/[0.02]"
                  >
                    <TeamCell teamId={realTeamId} teamById={teamById} />
                  </td>,
                ];
              })}
            </tr>
          ))
        )}
      </tbody>
      {started && (
        <tfoot>
          <tr>
            <th className="sticky left-0 z-10 bg-surface border-t border-border px-3 py-3 text-left text-xs uppercase tracking-widest text-accent font-mono">
              Puntos
            </th>
            {paidUsers.map((u) => (
              <th
                key={u.id + "-pts"}
                colSpan={2}
                className="bg-surface border-t border-border border-l border-border px-3 py-3 text-center"
              >
                <span className="text-xl font-bold tabular-nums">
                  {u.total_score ?? 0}
                </span>
              </th>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

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

/* ---------------- ranking ---------------- */

function Ranking({ paidUsers }: { paidUsers: UserRow[] }) {
  const eligible = paidUsers.filter((u) => u.prediction_status === "submitted");
  const sorted = [...eligible].sort((a, b) => {
    const ta = a.total_score ?? 0;
    const tb = b.total_score ?? 0;
    if (tb !== ta) return tb - ta;
    return a.display_name.localeCompare(b.display_name);
  });

  if (sorted.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        Aún nadie con pronóstico enviado y pagado. El ranking aparece cuando se
        cierre el plazo de envío.
      </p>
    );
  }

  return (
    <ol className="mt-4 divide-y divide-border">
      {sorted.map((u, i) => (
        <li
          key={u.id}
          className="flex items-center justify-between gap-3 py-3"
        >
          <div className="flex items-center gap-3">
            <span
              className={
                "inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold font-mono " +
                (i === 0
                  ? "bg-accent text-accent-foreground"
                  : i === 1
                  ? "bg-foreground/15 text-foreground"
                  : i === 2
                  ? "bg-warning/20 text-warning"
                  : "bg-surface-elevated text-muted")
              }
            >
              {i + 1}
            </span>
            <span className="font-medium">{u.display_name}</span>
          </div>
          <span className="font-mono tabular-nums text-lg font-bold">
            {u.total_score ?? 0} <span className="text-xs text-muted">pts</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- helpers ---------------- */

function emptySlots(): SlotTeamIds {
  return Object.fromEntries(
    GROUPS.map((g) => [g, [null, null, null] as [null, null, null]])
  ) as SlotTeamIds;
}

function computePredictedSlots(
  drawSeed: string,
  scores: PredScoreRow[],
  groupMatchesByGroup: Map<GroupLetter, GroupMatchRow[]>,
  teamsByGroup: Record<GroupLetter, string[]>
): SlotTeamIds | null {
  const scoreByMatch = new Map(scores.map((s) => [s.group_match_id, s]));
  const allComplete = GROUPS.every((g) =>
    groupMatchesByGroup.get(g)!.every((m) => scoreByMatch.has(m.id))
  );
  if (!allComplete) return null;

  const groupResults: GroupResult[] = GROUPS.map((g) => {
    const gms = groupMatchesByGroup.get(g)!;
    const matchScores = gms.map((m) => {
      const s = scoreByMatch.get(m.id)!;
      return {
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: s.home_score,
        awayScore: s.away_score,
      };
    });
    return {
      group: g,
      standings: computeGroupStandings(teamsByGroup[g], matchScores, drawSeed),
    };
  });

  const slots = emptySlots();
  for (const gr of groupResults) {
    slots[gr.group][0] = gr.standings[0]?.teamId ?? null;
    slots[gr.group][1] = gr.standings[1]?.teamId ?? null;
  }
  try {
    const { qualified } = determineBestThirds(groupResults, drawSeed);
    const qualifiedThirdIds = new Set(qualified.map((q) => q.teamId));
    for (const gr of groupResults) {
      const third = gr.standings[2]?.teamId ?? null;
      if (third && qualifiedThirdIds.has(third)) {
        slots[gr.group][2] = third;
      }
    }
  } catch {
    // Si la asignación de terceros falla (no debería con todos los grupos
    // completos), dejamos slot 3 vacío.
  }
  return slots;
}

function computeRealSlots(
  groupMatchesByGroup: Map<GroupLetter, GroupMatchRow[]>,
  teamsByGroup: Record<GroupLetter, string[]>
): SlotTeamIds {
  const slots = emptySlots();

  // Pre-calculamos standings de cada grupo con los partidos jugados.
  // Si un grupo no tiene ningún partido jugado, dejamos su fila en `—`.
  const groupResults: GroupResult[] = [];
  let allGroupsComplete = true;
  for (const g of GROUPS) {
    const gms = groupMatchesByGroup.get(g)!;
    const played = gms.filter(
      (m) => m.official_home_score !== null && m.official_away_score !== null
    );
    if (played.length === 0) {
      allGroupsComplete = false;
      continue;
    }
    if (played.length !== gms.length) allGroupsComplete = false;
    const matchScores = played.map((m) => ({
      homeTeamId: m.home_team_id,
      awayTeamId: m.away_team_id,
      homeScore: m.official_home_score!,
      awayScore: m.official_away_score!,
    }));
    const standings = computeGroupStandings(teamsByGroup[g], matchScores, "official");
    slots[g][0] = standings[0]?.teamId ?? null;
    slots[g][1] = standings[1]?.teamId ?? null;
    groupResults.push({ group: g, standings });
  }

  // Slot 3 real: solo lo proyectamos cuando todos los grupos están
  // completamente jugados (de lo contrario el ranking de "mejores terceros"
  // es ruido).
  if (allGroupsComplete && groupResults.length === GROUPS.length) {
    try {
      const { qualified } = determineBestThirds(groupResults, "official");
      const qualifiedThirdIds = new Set(qualified.map((q) => q.teamId));
      for (const gr of groupResults) {
        const third = gr.standings[2]?.teamId ?? null;
        if (third && qualifiedThirdIds.has(third)) {
          slots[gr.group][2] = third;
        }
      }
    } catch {
      // ignore
    }
  }

  return slots;
}
