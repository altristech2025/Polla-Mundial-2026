"use client";

import { useEffect, useState } from "react";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function diff(target: Date): Parts | null {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return { days, hours, minutes, seconds };
}

const pad = (n: number) => n.toString().padStart(2, "0");

export function Countdown({
  targetIso,
  label = "Falta para el partido inaugural",
}: {
  targetIso: string;
  label?: string;
}) {
  const target = new Date(targetIso);
  const [parts, setParts] = useState<Parts | null>(() => diff(target));

  useEffect(() => {
    const id = setInterval(() => setParts(diff(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!parts) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 px-6 py-5 text-center">
        <span className="font-mono text-sm uppercase tracking-widest text-success">
          🟢 Mundial en curso
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface px-6 py-5">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">{label}</p>
      <div className="mt-3 flex items-baseline justify-between gap-2 font-mono">
        <Unit value={parts.days} label="días" big />
        <Sep />
        <Unit value={pad(parts.hours)} label="horas" big />
        <Sep />
        <Unit value={pad(parts.minutes)} label="min" big />
        <Sep />
        <Unit value={pad(parts.seconds)} label="seg" />
      </div>
    </div>
  );
}

function Unit({
  value,
  label,
  big = false,
}: {
  value: number | string;
  label: string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col items-center min-w-[3.5ch]">
      <span
        className={
          big
            ? "text-4xl sm:text-5xl font-bold tabular-nums leading-none"
            : "text-2xl sm:text-3xl font-bold tabular-nums leading-none text-muted"
        }
      >
        {value}
      </span>
      <span className="mt-1 text-[10px] uppercase tracking-widest text-muted">
        {label}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="text-3xl text-muted/40 leading-none">:</span>;
}
