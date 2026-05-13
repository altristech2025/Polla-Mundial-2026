"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToastHost, showToast } from "@/components/toast";
import { SaveBadge, type SaveStatus } from "@/components/save-badge";
import { SubmitConfirmModal } from "@/components/submit-confirm-modal";
import { cn } from "@/lib/utils";
import {
  ALL_BRACKET_CODES,
  LEFT_R32, RIGHT_R32, LEFT_R16, RIGHT_R16, LEFT_QF, RIGHT_QF,
} from "@/lib/bracket-codes";

type Team = { id: string; code: string; name: string; flag: string | null };

type BracketMatch = {
  matchCode: string;
  round: string;
  matchDate: string;
  venue: string;
  slotSpec: string;
};

type R32Assignment = { matchCode: string; homeTeamId: string; awayTeamId: string };

export function BracketClient({
  teamMap,
  bracketMatches,
  r32Assignments,
  r32Ready,
  postR32Tree,
  picks: initialPicks,
  lockIso,
  submitted,
}: {
  teamMap: Record<string, Team>;
  bracketMatches: BracketMatch[];
  r32Assignments: R32Assignment[];
  r32Ready: boolean;
  postR32Tree: Record<string, { home: string; away: string; loserHome?: boolean; loserAway?: boolean }>;
  picks: Record<string, string | null>;
  lockIso: string;
  submitted: boolean;
}) {
  const router = useRouter();
  const locked = submitted || new Date(lockIso).getTime() < Date.now();
  const [picks, setPicks] = useState<Record<string, string | null>>(initialPicks);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const bracketPicksFilled = ALL_BRACKET_CODES.filter((c) => picks[c]).length;
  const bracketComplete = bracketPicksFilled >= ALL_BRACKET_CODES.length;

  const handleSubmit = async () => {
    setSubmitting(true);
    const res = await fetch("/api/me/submit", { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Error" }));
      showToast(error ?? "No se pudo enviar.");
      setShowSubmit(false);
      return;
    }
    setShowSubmit(false);
    showToast("✓ Pronóstico enviado. Suerte, pana.");
    router.refresh();
  };

  const pendingPickSave = useRef<Record<string, string | null>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const r32Map = useMemo(
    () => new Map(r32Assignments.map((a) => [a.matchCode, a])),
    [r32Assignments]
  );
  const bracketMatchMap = useMemo(
    () => new Map(bracketMatches.map((b) => [b.matchCode, b])),
    [bracketMatches]
  );

  // Resolver participantes de cada partido (cascade)
  const participants = useMemo(() => {
    const map = new Map<string, { home: string | null; away: string | null }>();
    const order = [
      ...LEFT_R32, ...RIGHT_R32,
      ...LEFT_R16, ...RIGHT_R16,
      ...LEFT_QF, ...RIGHT_QF,
      "P101", "P102", "P104", "P103",
    ];
    for (const code of order) {
      const m = bracketMatchMap.get(code);
      if (!m) continue;
      if (m.round === "R32") {
        const a = r32Map.get(code);
        map.set(code, { home: a?.homeTeamId ?? null, away: a?.awayTeamId ?? null });
      } else {
        const tree = postR32Tree[code];
        if (!tree) {
          map.set(code, { home: null, away: null });
          continue;
        }
        if (m.round === "3RD") {
          const homeMatch = bracketMatchMap.get(tree.home);
          const awayMatch = bracketMatchMap.get(tree.away);
          const homeSemi = homeMatch && map.get(homeMatch.matchCode);
          const awaySemi = awayMatch && map.get(awayMatch.matchCode);
          const homeLoser =
            homeSemi && picks[tree.home]
              ? homeSemi.home === picks[tree.home]
                ? homeSemi.away
                : homeSemi.home
              : null;
          const awayLoser =
            awaySemi && picks[tree.away]
              ? awaySemi.home === picks[tree.away]
                ? awaySemi.away
                : awaySemi.home
              : null;
          map.set(code, { home: homeLoser, away: awayLoser });
        } else {
          map.set(code, {
            home: picks[tree.home] ?? null,
            away: picks[tree.away] ?? null,
          });
        }
      }
    }
    return map;
  }, [bracketMatchMap, r32Map, picks, postR32Tree]);

  const invalidated = useMemo(() => {
    const inv = new Set<string>();
    for (const m of bracketMatches) {
      const p = participants.get(m.matchCode);
      const pick = picks[m.matchCode];
      if (pick && p && pick !== p.home && pick !== p.away) {
        inv.add(m.matchCode);
      }
    }
    return inv;
  }, [bracketMatches, participants, picks]);

  const flushSaves = useCallback(async () => {
    if (Object.keys(pendingPickSave.current).length === 0) return;
    const payload = Object.entries(pendingPickSave.current).map(([k, v]) => ({
      matchCode: k,
      pickedWinnerId: v,
    }));
    pendingPickSave.current = {};
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/me/bracket-picks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ picks: payload }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setSaveStatus("error");
      showToast("No se pudo guardar tu pick. Revisa conexión.");
    }
  }, []);

  const setPick = (matchCode: string, teamId: string) => {
    if (locked) return;
    setPicks((prev) => ({ ...prev, [matchCode]: teamId }));
    pendingPickSave.current[matchCode] = teamId;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSaves, 600);
  };

  if (!r32Ready) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <Card className="max-w-md text-center">
          <h2 className="text-xl font-bold">Primero completa la fase de grupos</h2>
          <p className="mt-2 text-muted text-sm">
            El bracket de 16avos se arma automáticamente cuando hayas predicho los 72 partidos de
            grupos.
          </p>
          <Link href="/mi-polla/grupos" className="mt-6 inline-block">
            <Button>Ir a fase de grupos</Button>
          </Link>
        </Card>
      </main>
    );
  }

  const renderCard = (code: string, opts?: { compact?: boolean; prominent?: boolean }) => {
    const m = bracketMatchMap.get(code);
    if (!m) return null;
    const p = participants.get(code) ?? { home: null, away: null };
    return (
      <MatchCard
        key={code}
        match={m}
        participants={p}
        pick={picks[code] ?? null}
        invalidated={invalidated.has(code)}
        teamMap={teamMap}
        onPick={(teamId) => setPick(code, teamId)}
        locked={locked}
        compact={opts?.compact}
        prominent={opts?.prominent}
      />
    );
  };

  // Get champion / runner-up / 3rd / 4th from picks for top-level display
  const finalParts = participants.get("P104");
  const thirdParts = participants.get("P103");
  const champion = picks["P104"] ?? null;
  const runnerUp =
    finalParts && champion
      ? finalParts.home === champion
        ? finalParts.away
        : finalParts.home
      : null;
  const third = picks["P103"] ?? null;
  const fourth =
    thirdParts && third
      ? thirdParts.home === third
        ? thirdParts.away
        : thirdParts.home
      : null;

  return (
    <>
      <ToastHost />
      {showSubmit && (
        <SubmitConfirmModal
          onCancel={() => setShowSubmit(false)}
          onConfirm={handleSubmit}
          submitting={submitting}
        />
      )}
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/mi-polla">
              <Button variant="ghost" size="sm">← Atrás</Button>
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">Paso 2</p>
              <h1 className="text-lg font-bold">Eliminación</h1>
            </div>
          </div>
          {!submitted && <SaveBadge status={saveStatus} />}
        </div>
        {submitted ? (
          <div className="bg-success/10 border-t border-success/30 px-6 py-2 text-center text-sm text-success">
            ✓ Pronóstico enviado. Ya no puedes editar.
          </div>
        ) : locked ? (
          <div className="bg-warning/10 border-t border-warning/30 px-6 py-2 text-center text-sm text-warning">
            Predicciones bloqueadas — la fecha límite ya pasó.
          </div>
        ) : null}
      </header>

      <main className="flex-1 px-3 py-6 overflow-x-auto">
        <div className="mx-auto w-fit min-w-full">
          <div className="grid grid-cols-7 gap-2 min-w-[1280px]" style={{ minHeight: "1100px" }}>

            {/* COL 1: R32 izquierda — 8 partidos */}
            <BracketColumn label="16avos" align="end">
              {LEFT_R32.map((code) => renderCard(code, { compact: true }))}
            </BracketColumn>

            {/* COL 2: R16 izquierda — 4 */}
            <BracketColumn label="Octavos" align="end" gap="lg">
              {LEFT_R16.map((code) => renderCard(code, { compact: true }))}
            </BracketColumn>

            {/* COL 3: QF izquierda — 2 */}
            <BracketColumn label="Cuartos" align="end" gap="xl">
              {LEFT_QF.map((code) => renderCard(code, { compact: true }))}
            </BracketColumn>

            {/* COL 4 CENTER: SF top, Final, 3°, SF bottom */}
            <div className="flex flex-col items-center justify-between py-2">
              <div className="w-full">
                <p className="text-[10px] uppercase tracking-widest text-muted font-mono text-center mb-2">
                  Semifinal
                </p>
                {renderCard("P101", { compact: true })}
              </div>

              <div className="w-full flex flex-col items-center gap-3">
                <div className="relative animate-trophy">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/world-cup-trophy.png"
                    alt="World Cup"
                    className="h-40 w-auto drop-shadow-[0_8px_24px_rgba(168,255,62,0.25)]"
                  />
                </div>
                <p className="text-[10px] uppercase tracking-widest text-accent font-mono">
                  Campeón
                </p>
                {champion ? (
                  <p className="text-lg font-bold text-center">
                    {teamMap[champion]?.flag ?? ""} {teamMap[champion]?.name ?? "—"}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Por definir</p>
                )}
                {renderCard("P104", { prominent: true })}
                <div className="w-full mt-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted font-mono text-center mb-2">
                    Tercer puesto
                  </p>
                  {renderCard("P103", { compact: true })}
                </div>
              </div>

              <div className="w-full">
                <p className="text-[10px] uppercase tracking-widest text-muted font-mono text-center mb-2">
                  Semifinal
                </p>
                {renderCard("P102", { compact: true })}
              </div>
            </div>

            {/* COL 5: QF derecha — 2 */}
            <BracketColumn label="Cuartos" align="start" gap="xl">
              {RIGHT_QF.map((code) => renderCard(code, { compact: true }))}
            </BracketColumn>

            {/* COL 6: R16 derecha — 4 */}
            <BracketColumn label="Octavos" align="start" gap="lg">
              {RIGHT_R16.map((code) => renderCard(code, { compact: true }))}
            </BracketColumn>

            {/* COL 7: R32 derecha — 8 */}
            <BracketColumn label="16avos" align="start">
              {RIGHT_R32.map((code) => renderCard(code, { compact: true }))}
            </BracketColumn>
          </div>

          {/* Resumen top 4 */}
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 max-w-4xl mx-auto">
            <Top4Card medal="🥇" label="Campeón" team={champion ? teamMap[champion] : null} highlight />
            <Top4Card medal="🥈" label="Subcampeón" team={runnerUp ? teamMap[runnerUp] : null} />
            <Top4Card medal="🥉" label="Tercer puesto" team={third ? teamMap[third] : null} />
            <Top4Card medal="4°" label="Cuarto puesto" team={fourth ? teamMap[fourth] : null} />
          </div>

          {/* CTA de envío definitivo */}
          {!submitted && (
            <div className="mt-12 max-w-2xl mx-auto">
              <Card className={locked ? "opacity-60" : ""}>
                <p className="text-xs uppercase tracking-widest text-accent font-mono">
                  Paso final
                </p>
                <h3 className="mt-2 text-xl font-bold">Enviar pronóstico definitivo</h3>
                <p className="mt-2 text-sm text-muted">
                  {locked
                    ? "Las predicciones están bloqueadas — la fecha límite ya pasó."
                    : bracketComplete
                    ? "Bracket listo. Cuando le des, queda quemado y nadie más puede cambiarlo."
                    : `Te faltan ${ALL_BRACKET_CODES.length - bracketPicksFilled} picks del bracket.`}
                </p>
                <div className="mt-6">
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={!bracketComplete || locked || submitting}
                    onClick={() => setShowSubmit(true)}
                  >
                    Enviar pronóstico definitivo
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted text-center">
                  Ojo: si te falta algún marcador en la fase de grupos, el envío
                  también te lo va a pedir.
                </p>
              </Card>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function BracketColumn({
  label,
  align,
  gap = "md",
  children,
}: {
  label: string;
  align: "start" | "end";
  gap?: "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <p
        className={cn(
          "text-[10px] uppercase tracking-widest text-muted font-mono mb-3",
          align === "start" ? "text-left" : "text-right"
        )}
      >
        {label}
      </p>
      <div className="flex-1 flex flex-col justify-around gap-2">{children}</div>
    </div>
  );
}

function Top4Card({
  medal,
  label,
  team,
  highlight,
}: {
  medal: string;
  label: string;
  team: Team | null | undefined;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-3 flex items-center gap-3",
        highlight && "border-accent bg-accent/5"
      )}
    >
      <span className="text-2xl">{medal}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
        <p className="text-sm font-medium truncate mt-0.5">
          {team ? `${team.flag ?? ""} ${team.name}` : "Por definir"}
        </p>
      </div>
    </Card>
  );
}

function MatchCard({
  match,
  participants,
  pick,
  invalidated,
  teamMap,
  onPick,
  locked,
  compact = false,
  prominent = false,
}: {
  match: BracketMatch;
  participants: { home: string | null; away: string | null };
  pick: string | null;
  invalidated: boolean;
  teamMap: Record<string, Team>;
  onPick: (teamId: string) => void;
  locked: boolean;
  compact?: boolean;
  prominent?: boolean;
}) {
  const home = participants.home ? teamMap[participants.home] : null;
  const away = participants.away ? teamMap[participants.away] : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface overflow-hidden",
        prominent ? "border-accent shadow-lg shadow-accent/10" : "border-border",
        invalidated && "border-error"
      )}
    >
      <TeamRow
        team={home}
        selected={pick === participants.home}
        disabled={locked || !participants.home}
        onClick={() => participants.home && onPick(participants.home)}
        compact={compact}
      />
      <div className="border-t border-border" />
      <TeamRow
        team={away}
        selected={pick === participants.away}
        disabled={locked || !participants.away}
        onClick={() => participants.away && onPick(participants.away)}
        compact={compact}
      />
      {!compact && (
        <div className="px-2 py-1 text-[10px] text-muted font-mono border-t border-border flex items-center justify-between">
          <span>{match.matchCode}</span>
          <span>
            {new Date(match.matchDate).toLocaleDateString("es-EC", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function TeamRow({
  team,
  selected,
  disabled,
  onClick,
  compact,
}: {
  team: Team | null;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2 transition-all text-left",
        compact ? "py-1.5" : "py-2",
        selected
          ? "bg-accent/15 text-foreground"
          : "bg-background hover:bg-surface-elevated disabled:opacity-50 disabled:hover:bg-background",
        "cursor-pointer disabled:cursor-not-allowed"
      )}
    >
      <span className="text-sm w-5 text-center shrink-0">{team?.flag ?? "·"}</span>
      <span className="flex-1 truncate text-xs font-medium">
        {team ? team.code : "—"}
      </span>
      {selected && <span className="text-accent text-[10px] font-mono shrink-0">✓</span>}
    </button>
  );
}
