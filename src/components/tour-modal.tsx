"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Step = { title: string; body: string };

const STEPS: Step[] = [
  {
    title: "Fase de grupos",
    body: "Vas a ver los 12 grupos del Mundial. Para cada partido, escribes el marcador que crees que va a quedar. La tabla del grupo se calcula sola conforme escribes.",
  },
  {
    title: "Tus marcadores arman el bracket",
    body: "Cuando completas los 72 partidos, la app calcula automáticamente los 32 clasificados (12 primeros, 12 segundos y los 8 mejores terceros) y arma los cruces de 16avos.",
  },
  {
    title: "Eliminación directa",
    body: "Click en el equipo que crees que gana cada partido. El ganador sube al siguiente cruce. Hasta llegar a la final.",
  },
  {
    title: "Orden final top 4",
    body: "Define quién queda 1°, 2°, 3° y 4°. Acertar el orden exacto vale un bono jugoso.",
  },
  {
    title: "Enviar pronóstico",
    body: "Puedes editar hasta el 10 de junio 23:59. El 11 al amanecer, la app se cierra para edición y revela todos los pronósticos. Después, conforme avanza el Mundial, los puntos se acumulan en vivo.",
  },
];

export function TourModal({
  onClose,
}: {
  onClose: (took: "tour" | "skip") => void;
}) {
  const [step, setStep] = useState<number | "intro">("intro");

  if (step === "intro") {
    return (
      <Backdrop>
        <div className="rounded-2xl bg-surface border border-border p-8 max-w-md w-full space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">¿Te doy el tour?</h2>
            <p className="text-muted">
              Te explico en 5 pasos cómo funciona la polla. Tarda menos de 1 minuto.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={() => setStep(0)}>
              Dame el tour
            </Button>
            <Button size="lg" variant="ghost" onClick={() => onClose("skip")}>
              No, gracias
            </Button>
          </div>
        </div>
      </Backdrop>
    );
  }

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Backdrop>
      <div className="rounded-2xl bg-surface border border-border p-8 max-w-md w-full space-y-6">
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={
                "h-1 flex-1 rounded-full " +
                (i <= step ? "bg-accent" : "bg-border")
              }
            />
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            Paso {step + 1} de {STEPS.length}
          </p>
          <h2 className="text-2xl font-bold">{s.title}</h2>
          <p className="text-muted leading-relaxed">{s.body}</p>
        </div>
        <div className="flex justify-between gap-3">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep((s) => (typeof s === "number" && s > 0 ? s - 1 : s))}
          >
            Atrás
          </Button>
          {isLast ? (
            <Button onClick={() => onClose("tour")}>Entendido</Button>
          ) : (
            <Button
              onClick={() =>
                setStep((s) => (typeof s === "number" ? s + 1 : 0))
              }
            >
              Siguiente
            </Button>
          )}
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      {children}
    </div>
  );
}
