"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Countdown } from "@/components/countdown";
import { TourModal } from "@/components/tour-modal";
import { ToastHost, showToast } from "@/components/toast";
import { BrandLogo } from "@/components/brand-logo";
import { SubmitConfirmModal } from "@/components/submit-confirm-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const TOTAL_GROUP_SCORES = 72;
const TOTAL_BRACKET_PICKS = 32;

export function MiPollaClient({
  displayName,
  tourCompleted,
  isAdmin,
  tournamentStartIso,
  lockIso,
  predictionStatus,
  submittedAt,
  groupScoresFilled,
  bracketPicksFilled,
}: {
  displayName: string;
  tourCompleted: boolean;
  isAdmin: boolean;
  tournamentStartIso: string;
  lockIso: string;
  predictionStatus: string;
  submittedAt: string | null;
  groupScoresFilled: number;
  bracketPicksFilled: number;
}) {
  const router = useRouter();
  const [showTour, setShowTour] = useState(!tourCompleted);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitted = predictionStatus === "submitted";
  const locked = submitted || new Date(lockIso).getTime() < Date.now();
  const groupsComplete = groupScoresFilled >= TOTAL_GROUP_SCORES;
  const bracketComplete = bracketPicksFilled >= TOTAL_BRACKET_PICKS;
  const ready = groupsComplete && bracketComplete && !locked;

  async function handleTourClose(took: "tour" | "skip") {
    setShowTour(false);
    fetch("/api/me/tour", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ took }),
    }).catch(() => {});
    if (took === "skip") {
      showToast("Bueno ojalá no seas shunsho 🤝");
    }
  }

  async function handleSubmit() {
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
  }

  return (
    <>
      {showTour && <TourModal onClose={handleTourClose} />}
      <ToastHost />
      {showSubmit && (
        <SubmitConfirmModal
          onCancel={() => setShowSubmit(false)}
          onConfirm={handleSubmit}
          submitting={submitting}
        />
      )}

      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
                Polla Mundial 2026
              </p>
              <p className="text-sm text-muted">Hola, {displayName}.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/resultados">
              <Button variant="ghost" size="sm">Resultados</Button>
            </Link>
            <Link href="/pronosticos">
              <Button variant="ghost" size="sm">Pronósticos</Button>
            </Link>
            <Link href="/reglas">
              <Button variant="ghost" size="sm">Reglas</Button>
            </Link>
            {isAdmin && (
              <Link href="/admin">
                <Button variant="secondary" size="sm">Admin</Button>
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <Countdown targetIso={tournamentStartIso} />

          {submitted && (
            <Card className="border-success bg-success/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-success font-mono">
                    ✓ pronóstico enviado
                  </p>
                  <h3 className="mt-1 text-xl font-bold">Quemado y guardado</h3>
                  <p className="mt-1 text-sm text-muted">
                    Lo enviaste{" "}
                    {submittedAt
                      ? new Date(submittedAt).toLocaleString("es-EC", {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "ya"}
                    . Ya no se puede editar.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <section className="grid gap-4 md:grid-cols-3">
            <StepCard
              step={1}
              title="Fase de grupos"
              description="Escribe los marcadores de los 72 partidos."
              href="/mi-polla/grupos"
              progress={`${groupScoresFilled}/${TOTAL_GROUP_SCORES}`}
              complete={groupsComplete}
              locked={submitted}
            />
            <StepCard
              step={2}
              title="Eliminación"
              description="Pica al ganador de cada partido hasta el campeón."
              href="/mi-polla/bracket"
              progress={`${bracketPicksFilled}/${TOTAL_BRACKET_PICKS}`}
              complete={bracketComplete}
              locked={submitted || !groupsComplete}
              disabledReason={!groupsComplete ? "Completa fase de grupos primero" : undefined}
            />

            <Card className={submitted ? "opacity-60" : ""}>
              <p className="text-xs uppercase tracking-widest text-accent font-mono">
                Paso 3
              </p>
              <h3 className="mt-2 text-xl font-bold">Enviar pronóstico</h3>
              <p className="mt-2 text-sm text-muted">
                {submitted
                  ? "Ya está enviado. No se puede deshacer."
                  : ready
                  ? "Todo listo. Cuando le des, queda quemado y nadie más puede cambiarlo."
                  : `Completa los pasos 1 y 2 (faltan ${
                      TOTAL_GROUP_SCORES -
                      groupScoresFilled +
                      (TOTAL_BRACKET_PICKS - bracketPicksFilled)
                    }).`}
              </p>
              <div className="mt-6">
                <Button
                  size="lg"
                  className="w-full"
                  disabled={!ready || submitted}
                  onClick={() => setShowSubmit(true)}
                >
                  {submitted ? "Ya enviado" : "Enviar pronóstico definitivo"}
                </Button>
              </div>
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}

function StepCard({
  step,
  title,
  description,
  href,
  progress,
  complete,
  locked,
  disabledReason,
}: {
  step: number;
  title: string;
  description: string;
  href: string;
  progress: string;
  complete: boolean;
  locked: boolean;
  disabledReason?: string;
}) {
  const inner = (
    <Card
      className={
        locked
          ? "h-full opacity-60"
          : "h-full transition-colors hover:border-accent cursor-pointer"
      }
    >
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-widest text-accent font-mono">
          Paso {step}
        </p>
        <span
          className={
            "font-mono tabular-nums text-sm " +
            (complete ? "text-success" : "text-muted")
          }
        >
          {complete ? "✓ " : ""}
          {progress}
        </span>
      </div>
      <h3 className="mt-2 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-muted">
        {disabledReason ?? description}
      </p>
    </Card>
  );

  if (locked) return inner;
  return <Link href={href}>{inner}</Link>;
}

