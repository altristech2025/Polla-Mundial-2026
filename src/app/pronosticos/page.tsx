/**
 * Página pública (con login) que muestra todos los participantes.
 * - Estado "pagó" visible desde el día 1 (lo controla admin).
 * - Predicciones (R32 + R16) ocultas hasta `reveal_at` (10 jun 00:00).
 * - Tras reveal: cada usuario muestra las 32 selecciones que pasan a R32 y
 *   las 16 que pasan a R16 según sus picks.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/countdown";
import { BrandLogo } from "@/components/brand-logo";
import {
  GROUPS,
  type GroupLetter,
  determineBestThirds,
} from "@/lib/qualification";
import { computeGroupStandings } from "@/lib/tiebreakers";
import { groupBy } from "@/lib/utils";
import { R32_CODES } from "@/lib/bracket-codes";

type ConfigRow = {
  predictions_lock_at: string;
  reveal_at: string;
  tournament_start_at: string;
};

type UserRow = {
  id: string;
  display_name: string;
  has_paid: boolean;
  prediction_status: string | null;
  prediction_id: string | null;
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

const R32_CODES_SET = new Set<string>(R32_CODES);

export default async function PronosticosPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [config] = (await sql`
    select predictions_lock_at, reveal_at, tournament_start_at from app_config where id = 1
  `) as unknown as ConfigRow[];

  const revealed = new Date(config.reveal_at).getTime() <= Date.now();

  const users = (await sql`
    select
      u.id, u.display_name, u.has_paid,
      p.id as prediction_id, p.status as prediction_status
    from users u
    left join predictions p on p.user_id = u.id
    order by u.has_paid desc, u.display_name asc
  `) as unknown as UserRow[];

  // Si aún no se reveló, mostramos solo la lista de participantes
  if (!revealed) {
    return (
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-8">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <BrandLogo className="h-8" />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
                  Pronósticos de la polla
                </p>
                <h1 className="mt-2 text-3xl font-bold">Participantes</h1>
                <p className="mt-2 text-muted">
                  Los pronósticos de cada uno se hacen visibles el 10 de junio.
                  Hasta entonces sólo verás quién está adentro y quién ya pagó.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/resultados"><Button variant="ghost" size="sm">Resultados</Button></Link>
              <Link href="/reglas"><Button variant="ghost" size="sm">Reglas</Button></Link>
              <Link href="/mi-polla"><Button variant="ghost" size="sm">Mi polla</Button></Link>
            </div>
          </header>

          <Countdown
            targetIso={config.reveal_at}
            label="Falta para revelar todos los pronósticos"
          />

          <Card>
            <p className="text-sm uppercase tracking-widest text-muted font-mono">
              {users.length} participantes
            </p>
            <div className="mt-4 space-y-2">
              {users.map((u) => (
                <ParticipantRow
                  key={u.id}
                  name={u.display_name}
                  hasPaid={u.has_paid}
                  submitted={u.prediction_status === "submitted"}
                  isYou={u.id === session.user!.id}
                />
              ))}
            </div>
          </Card>
        </div>
      </main>
    );
  }

  // Tras reveal: necesitamos calcular las predicciones R32 y R16 por usuario
  const teams = (await sql`
    select id, code, name, flag_emoji, group_letter, group_position
    from teams order by group_letter, group_position
  `) as unknown as TeamRow[];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamsByGroup: Record<GroupLetter, string[]> = Object.fromEntries(
    GROUPS.map((g) => [g, teams.filter((t) => t.group_letter === g).map((t) => t.id)])
  ) as Record<GroupLetter, string[]>;

  const groupMatches = (await sql`
    select id, group_letter, home_team_id, away_team_id from group_matches
  `) as unknown as GroupMatchRow[];

  const allPredIds = users.map((u) => u.prediction_id).filter(Boolean) as string[];
  const allScores = (await sql`
    select prediction_id, group_match_id, home_score, away_score
    from prediction_group_scores
    where prediction_id = any(${allPredIds})
  `) as unknown as PredScoreRow[];
  const allPicks = (await sql`
    select prediction_id, match_code, picked_winner_id
    from prediction_bracket_picks
    where prediction_id = any(${allPredIds})
  `) as unknown as PredPickRow[];

  const scoresByPred = groupBy(allScores, (r) => r.prediction_id);
  const picksByPred = groupBy(allPicks, (r) => r.prediction_id);
  // Pre-filtrar group_matches por grupo una sola vez (no por usuario)
  const groupMatchesByGroup = new Map<GroupLetter, GroupMatchRow[]>();
  for (const g of GROUPS) {
    groupMatchesByGroup.set(g, groupMatches.filter((m) => m.group_letter === g));
  }

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
                Pronósticos revelados
              </p>
              <h1 className="mt-2 text-3xl font-bold">Lo que cada uno predijo</h1>
            </div>
          </div>
          <Link href="/mi-polla"><Button variant="ghost" size="sm">Mi polla</Button></Link>
        </header>

        <div className="space-y-6">
          {users.map((u) => {
            const userScores = u.prediction_id ? scoresByPred.get(u.prediction_id) ?? [] : [];
            const userPicks = u.prediction_id ? picksByPred.get(u.prediction_id) ?? [] : [];

            const r32Teams = computeR32Teams(u.id, userScores, groupMatchesByGroup, teamsByGroup);
            const r16Teams = new Set<string>();
            for (const p of userPicks) {
              if (R32_CODES_SET.has(p.match_code) && p.picked_winner_id) {
                r16Teams.add(p.picked_winner_id);
              }
            }

            return (
              <Card key={u.id}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">{u.display_name}</h2>
                    {u.id === session.user!.id && (
                      <span className="text-[10px] uppercase tracking-widest text-accent font-mono">
                        tú
                      </span>
                    )}
                    <PaidBadge paid={u.has_paid} />
                    {u.prediction_status === "submitted" ? (
                      <span className="text-[10px] uppercase tracking-widest text-success font-mono">
                        ✓ enviado
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-warning font-mono">
                        borrador
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <TeamGrid
                    title="Clasifican a 16avos"
                    subtitle={`${r32Teams.size}/32 equipos`}
                    teams={[...r32Teams].map((id) => teamById.get(id)!).filter(Boolean)}
                  />
                  <TeamGrid
                    title="Clasifican a Octavos"
                    subtitle={`${r16Teams.size}/16 equipos`}
                    teams={[...r16Teams].map((id) => teamById.get(id)!).filter(Boolean)}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function computeR32Teams(
  userId: string,
  scores: PredScoreRow[],
  groupMatchesByGroup: Map<GroupLetter, GroupMatchRow[]>,
  teamsByGroup: Record<GroupLetter, string[]>
): Set<string> {
  const result = new Set<string>();
  const scoreByMatch = new Map(scores.map((s) => [s.group_match_id, s]));
  const allComplete = GROUPS.every((g) =>
    groupMatchesByGroup.get(g)!.every((m) => scoreByMatch.has(m.id))
  );
  if (!allComplete) return result;

  const groupResults = GROUPS.map((g) => {
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
      group: g as GroupLetter,
      standings: computeGroupStandings(teamsByGroup[g], matchScores, userId),
    };
  });
  for (const gr of groupResults) {
    result.add(gr.standings[0].teamId);
    result.add(gr.standings[1].teamId);
  }
  try {
    const { qualified } = determineBestThirds(groupResults, userId);
    for (const t of qualified) result.add(t.teamId);
  } catch {
    // ignore
  }
  return result;
}

function ParticipantRow({
  name,
  hasPaid,
  submitted,
  isYou,
}: {
  name: string;
  hasPaid: boolean;
  submitted: boolean;
  isYou: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <p className="font-medium truncate">{name}</p>
        {isYou && (
          <span className="text-[10px] uppercase tracking-widest text-accent font-mono">tú</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <PaidBadge paid={hasPaid} />
        {submitted ? (
          <span className="text-[10px] uppercase tracking-widest text-success font-mono">
            ✓ listo
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-muted font-mono">
            borrador
          </span>
        )}
      </div>
    </div>
  );
}

function PaidBadge({ paid }: { paid: boolean }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest font-mono " +
        (paid
          ? "bg-success/15 text-success border border-success/30"
          : "bg-warning/10 text-warning border border-warning/30")
      }
    >
      {paid ? "✓ pagó" : "sin pagar"}
    </span>
  );
}

function TeamGrid({
  title,
  subtitle,
  teams,
}: {
  title: string;
  subtitle: string;
  teams: TeamRow[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] uppercase tracking-widest text-accent font-mono">{title}</p>
        <span className="text-[10px] text-muted font-mono">{subtitle}</span>
      </div>
      <ul className="grid grid-cols-4 gap-2">
        {teams.map((t) => (
          <li key={t.id} className="flex items-center gap-1.5 text-xs">
            <span className="text-base">{t.flag_emoji ?? ""}</span>
            <span className="font-mono">{t.code}</span>
          </li>
        ))}
        {teams.length === 0 && (
          <li className="col-span-4 text-xs text-muted italic">
            Sin predicción
          </li>
        )}
      </ul>
    </div>
  );
}
