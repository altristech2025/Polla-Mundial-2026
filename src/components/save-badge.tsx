"use client";

import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === "idle") {
    return (
      <span className="text-[10px] uppercase tracking-widest text-muted font-mono">
        autoguardado
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono transition-opacity",
        status === "saving" && "text-muted",
        status === "saved" && "text-success",
        status === "error" && "text-error"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "saving" && "bg-muted animate-pulse",
          status === "saved" && "bg-success",
          status === "error" && "bg-error"
        )}
      />
      {status === "saving" && "Guardando…"}
      {status === "saved" && "Guardado"}
      {status === "error" && "Error al guardar"}
    </span>
  );
}
