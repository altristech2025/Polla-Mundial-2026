"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SubmitConfirmModal({
  onCancel,
  onConfirm,
  submitting,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const textOk = confirmText.trim().toUpperCase() === "ENVIAR";
  const canConfirm = acknowledged && textOk && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="rounded-2xl bg-surface border border-border p-8 max-w-md w-full space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-warning font-mono">
            ⚠ Última oportunidad
          </p>
          <h2 className="text-2xl font-bold mt-2">¿Enviar tu pronóstico?</h2>
          <p className="mt-2 text-sm text-muted">
            Una vez enviado queda <strong>quemado para siempre</strong>. Nadie (ni
            siquiera Ernesto) puede modificarlo después. Hasta el 10 de junio a las
            23:59 puedes seguir editando libremente sin enviar.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 accent-accent cursor-pointer"
          />
          <span className="text-foreground">
            Entiendo que no podré editar después de enviar.
          </span>
        </label>

        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-widest text-muted font-mono">
            Escribe <span className="text-accent">ENVIAR</span> para confirmar
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            placeholder="ENVIAR"
            className="w-full h-11 rounded-lg border border-border bg-background px-3 text-base font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1"
          >
            Mejor sigo ajustando
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1"
          >
            {submitting ? "Enviando…" : "Sí, enviar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
