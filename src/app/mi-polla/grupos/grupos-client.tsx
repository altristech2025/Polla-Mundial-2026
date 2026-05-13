"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToastHost, showToast } from "@/components/toast";
import { SaveBadge, type SaveStatus } from "@/components/save-badge";
import { computeGroupStandings, type TeamStanding } from "@/lib/tiebreakers";
import { GROUPS, determineBestThirds, type GroupLetter } from "@/lib/qualification";

export type GroupBundle = {
  group: string;
  teams: Array<{ id: string; code: string; name: string; flag: string | null; position: number }>;
  matches: Array<{
    id: string;
    matchDay: number;
    matchDate: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
  }>;
};

type ScoresMap = Map<string, { home: number | null; away: number | null }>;

export function GruposClient({
  bundles,
  lockIso,
  submitted,
}: {
  bundles: GroupBundle[];
  lockIso: string;
  submitted: boolean;
}) {
  const locked = submitted || new Date(lockIso).getTime() < Date.now();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const initialScores: ScoresMap = useMemo(() => {
    const m: ScoresMap = new Map();
    for (const b of bundles) {
      for (const match of b.matches) {
        m.set(match.id, { home: match.homeScore, away: match.awayScore });
      }
    }
    return m;
  }, [bundles]);

  const [scores, setScores] = useState<ScoresMap>(initialScores);
  const pendingSave = useRef<Map<string, { home: number | null; away: number | null }>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const flushSaves = useCallback(async () => {
    if (pendingSave.current.size === 0) return;
    const payload = Array.from(pendingSave.current.entries()).map(([id, v]) => ({
      groupMatchId: id,
      homeScore: v.home,
      awayScore: v.away,
    }));
    pendingSave.current.clear();
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/me/group-scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scores: payload }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setSaveStatus("error");
      showToast("No se pudieron guardar tus marcadores. Revisa tu conexión.");
    }
  }, []);

  const setScore = (matchId: string, which: "home" | "away", raw: string) => {
    if (locked) return;
    const n = raw === "" ? null : Math.max(0, Math.min(99, Number(raw)));
    setScores((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId) ?? { home: null, away: null };
      const updated = { ...cur, [which]: n };
      next.set(matchId, updated);
      pendingSave.current.set(matchId, updated);
      return next;
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSaves, 800);
  };

  const completedCount = useMemo(
    () => countCompletedTeams(bundles, scores),
    [bundles, scores]
  );

  return (
    <>
      <ToastHost />
      <Header completedCount={completedCount} locked={locked} saveStatus={saveStatus} submitted={submitted} />

      <main className="flex-1 px-6 pb-32">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => (
              <GroupCard key={b.group} bundle={b} scores={scores} onSetScore={setScore} locked={locked} />
            ))}
          </div>
          <ClassificationSummary bundles={bundles} scores={scores} />
        </div>
      </main>

      <BottomBar completedCount={completedCount} locked={locked} />
    </>
  );
}

function Header({
  completedCount,
  locked,
  saveStatus,
  submitted,
}: {
  completedCount: number;
  locked: boolean;
  saveStatus: SaveStatus;
  submitted: boolean;
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/mi-polla">
            <Button variant="ghost" size="sm">← Atrás</Button>
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">Paso 1</p>
            <h1 className="text-lg font-bold">Fase de grupos</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {!submitted && <SaveBadge status={saveStatus} />}
          <div className="text-right">
            <p className="font-mono text-2xl tabular-nums">{completedCount}/32</p>
            <p className="text-[10px] uppercase tracking-widest text-muted">clasificados a 16avos</p>
          </div>
        </div>
      </div>
      {submitted ? (
        <div className="bg-success/10 border-b border-success/30 px-6 py-2 text-center text-sm text-success">
          ✓ Pronóstico enviado. Ya no puedes editar.
        </div>
      ) : locked ? (
        <div className="bg-warning/10 border-b border-warning/30 px-6 py-2 text-center text-sm text-warning">
          Predicciones bloqueadas — la fecha límite ya pasó.
        </div>
      ) : null}
    </header>
  );
}

function BottomBar({ completedCount, locked }: { completedCount: number; locked: boolean }) {
  const pct = Math.round((completedCount / 32) * 100);
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted font-mono">{pct}% del bracket armado</p>
        </div>
        <Link href="/mi-polla/bracket">
          <Button disabled={completedCount < 32 || locked}>
            Ir a eliminación →
          </Button>
        </Link>
      </div>
    </div>
  );
}

function GroupCard({
  bundle,
  scores,
  onSetScore,
  locked,
}: {
  bundle: GroupBundle;
  scores: ScoresMap;
  onSetScore: (id: string, which: "home" | "away", value: string) => void;
  locked: boolean;
}) {
  const standings = useMemo(() => {
    const matches = bundle.matches
      .map((m) => {
        const s = scores.get(m.id);
        if (!s || s.home === null || s.away === null) return null;
        return {
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeScore: s.home,
          awayScore: s.away,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    const standings = computeGroupStandings(
      bundle.teams.map((t) => t.id),
      matches,
      "global"
    );
    return standings;
  }, [bundle, scores]);

  const teamById = new Map(bundle.teams.map((t) => [t.id, t]));
  const allFilled = bundle.matches.every((m) => {
    const s = scores.get(m.id);
    return s && s.home !== null && s.away !== null;
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">Grupo {bundle.group}</h3>
        {allFilled && (
          <span className="text-[10px] uppercase tracking-widest text-success font-mono">
            ✓ completo
          </span>
        )}
      </div>

      <Standings standings={standings} teamById={teamById} />

      <div className="mt-4 space-y-1.5">
        {bundle.matches.map((m) => {
          const s = scores.get(m.id);
          const home = teamById.get(m.homeTeamId);
          const away = teamById.get(m.awayTeamId);
          if (!home || !away) return null;
          return (
            <div
              key={m.id}
              className="grid items-center gap-2 text-sm"
              style={{ gridTemplateColumns: "1fr 2.5rem auto 2.5rem 1fr" }}
            >
              <div className="flex items-center justify-end gap-1.5 min-w-0">
                <span className="font-mono text-xs tabular-nums text-foreground truncate" title={home.name}>
                  {home.code}
                </span>
                <span className="text-base shrink-0">{home.flag ?? ""}</span>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                disabled={locked}
                value={s?.home ?? ""}
                onChange={(e) => onSetScore(m.id, "home", e.target.value)}
                className="h-9 w-10 text-center rounded-md border border-border bg-background font-mono tabular-nums focus:border-accent focus:outline-none"
                aria-label={`Goles ${home.name}`}
              />
              <span className="text-muted text-xs">–</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                disabled={locked}
                value={s?.away ?? ""}
                onChange={(e) => onSetScore(m.id, "away", e.target.value)}
                className="h-9 w-10 text-center rounded-md border border-border bg-background font-mono tabular-nums focus:border-accent focus:outline-none"
                aria-label={`Goles ${away.name}`}
              />
              <div className="flex items-center justify-start gap-1.5 min-w-0">
                <span className="text-base shrink-0">{away.flag ?? ""}</span>
                <span className="font-mono text-xs tabular-nums text-foreground truncate" title={away.name}>
                  {away.code}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Standings({
  standings,
  teamById,
}: {
  standings: TeamStanding[];
  teamById: Map<string, GroupBundle["teams"][number]>;
}) {
  return (
    <table className="w-full text-xs">
      <thead className="text-muted">
        <tr>
          <th className="text-left font-medium pb-1">#</th>
          <th className="text-left font-medium pb-1">Equipo</th>
          <th className="text-center font-medium pb-1">PJ</th>
          <th className="text-center font-medium pb-1">DG</th>
          <th className="text-center font-medium pb-1">Pts</th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {standings.map((s, i) => {
          const t = teamById.get(s.teamId);
          const status =
            i === 0 ? "1°" : i === 1 ? "2°" : i === 2 ? "3°" : "4°";
          const rowColor =
            i < 2 ? "text-foreground" : i === 2 ? "text-warning" : "text-muted";
          return (
            <tr key={s.teamId} className={rowColor}>
              <td className="py-0.5">{status}</td>
              <td className="py-0.5 truncate max-w-[10ch]">{t?.code}</td>
              <td className="text-center">{s.played}</td>
              <td className="text-center">{s.goalDiff > 0 ? "+" : ""}{s.goalDiff}</td>
              <td className="text-center font-bold">{s.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Panel resumen al pie de la página: muestra quién pasa de cada grupo y los 8
 * mejores terceros, según los marcadores actuales del usuario. Sirve para que
 * el usuario verifique sus predicciones antes de pasar al bracket.
 */
function ClassificationSummary({
  bundles,
  scores,
}: {
  bundles: GroupBundle[];
  scores: ScoresMap;
}) {
  // Solo mostramos si TODOS los grupos están completos. Si faltan, mostramos
  // un placeholder que dice cuántos faltan.
  const groupsComplete: Array<{
    group: string;
    teams: Array<GroupBundle["teams"][number]>;
    standings: TeamStanding[];
  }> = [];
  let incompleteCount = 0;

  for (const b of bundles) {
    const matches = b.matches
      .map((m) => {
        const s = scores.get(m.id);
        if (!s || s.home === null || s.away === null) return null;
        return {
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeScore: s.home,
          awayScore: s.away,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    if (matches.length < b.matches.length) {
      incompleteCount++;
      continue;
    }
    const standings = computeGroupStandings(
      b.teams.map((t) => t.id),
      matches,
      "global"
    );
    groupsComplete.push({ group: b.group, teams: b.teams, standings });
  }

  if (incompleteCount > 0) {
    return (
      <Card>
        <h3 className="text-xl font-bold">Resumen — Quiénes pasan</h3>
        <p className="mt-1 text-sm text-muted">
          Completa todos los grupos para ver el resumen. Faltan{" "}
          <strong>{incompleteCount}</strong> grupos por completar.
        </p>
      </Card>
    );
  }

  // Best thirds
  const groupResults = groupsComplete.map((g) => ({
    group: g.group as GroupLetter,
    standings: g.standings,
  }));
  let bestThirdsIds: Set<string> = new Set();
  try {
    const { qualified } = determineBestThirds(groupResults, "global");
    bestThirdsIds = new Set(qualified.map((q) => q.teamId));
  } catch {
    // si falla la asignación, no mostramos terceros
  }

  const teamMap = new Map<string, GroupBundle["teams"][number]>();
  for (const b of bundles) for (const t of b.teams) teamMap.set(t.id, t);

  return (
    <Card>
      <h3 className="text-xl font-bold">Resumen — Quiénes pasan según tu predicción</h3>
      <p className="mt-1 text-sm text-muted">
        Verifica que los clasificados de cada grupo sean los que esperabas. Los
        terceros que NO clasifican aparecen tachados.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => {
          const gr = groupsComplete.find((x) => x.group === g);
          if (!gr) return null;
          return (
            <div key={g} className="rounded-lg border border-border bg-background p-4">
              <p className="font-bold text-sm mb-2">Grupo {g}</p>
              <ol className="space-y-1 text-sm">
                {gr.standings.map((s, i) => {
                  const t = teamMap.get(s.teamId);
                  const pos = i + 1;
                  const passesAsThird = i === 2 && bestThirdsIds.has(s.teamId);
                  const passes = i < 2 || passesAsThird;
                  return (
                    <li key={s.teamId} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-muted text-xs w-4">{pos}°</span>
                        <span className="text-lg shrink-0">{t?.flag ?? ""}</span>
                        <span className={passes ? "" : "line-through text-muted"}>
                          {t?.name ?? t?.code}
                        </span>
                      </span>
                      <span className="font-mono text-xs">
                        {pos === 1 && <span className="text-accent">✓ 1°</span>}
                        {pos === 2 && <span className="text-accent">✓ 2°</span>}
                        {pos === 3 && passesAsThird && (
                          <span className="text-warning">✓ 3° best</span>
                        )}
                        {pos === 3 && !passesAsThird && (
                          <span className="text-muted">no</span>
                        )}
                        {pos === 4 && <span className="text-muted">no</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>

      {bestThirdsIds.size > 0 && (
        <div className="mt-6 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="text-xs uppercase tracking-widest text-warning font-mono">
            Top 8 mejores terceros
          </p>
          <p className="mt-2 text-sm text-muted">
            Estos 8 son los terceros que clasifican entre los 12 grupos:
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
            {[...bestThirdsIds].map((id) => {
              const t = teamMap.get(id);
              if (!t) return null;
              const groupOfTeam = bundles.find((b) =>
                b.teams.some((x) => x.id === id)
              )?.group;
              return (
                <li key={id} className="flex items-center gap-2">
                  <span className="text-lg">{t.flag ?? ""}</span>
                  <span className="truncate">
                    {t.name}{" "}
                    <span className="text-muted text-xs">(G {groupOfTeam})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

function countCompletedTeams(bundles: GroupBundle[], scores: ScoresMap): number {
  // Count how many "qualified to R32" teams we've definitively determined.
  // Per group: top 2 = 24. Best thirds = 8 (needs ALL 12 groups complete).
  // This count is informational; full bracket resolution happens elsewhere.
  let count = 0;
  let groupsComplete = 0;
  for (const b of bundles) {
    const allFilled = b.matches.every((m) => {
      const s = scores.get(m.id);
      return s && s.home !== null && s.away !== null;
    });
    if (allFilled) {
      count += 2;
      groupsComplete++;
    }
  }
  if (groupsComplete === 12) count += 8;
  return count;
}
