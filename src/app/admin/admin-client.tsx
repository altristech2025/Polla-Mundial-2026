"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ToastHost, showToast } from "@/components/toast";
import { BrandLogo } from "@/components/brand-logo";

type User = {
  id: string;
  username: string | null;
  display_name: string;
  is_admin: boolean;
  has_paid: boolean;
  is_suspended: boolean;
  created_at: string;
  total_score: number;
  prediction_status: string | null;
};

export function AdminClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCreds, setNewCreds] = useState<{ username: string; password: string } | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: name, isAdmin: makeAdmin }),
    });
    setCreating(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Error" }));
      showToast(error ?? "No se pudo crear.");
      return;
    }
    const { user, username, password } = await res.json();
    setUsers((prev) => [
      { ...user, has_paid: false, total_score: 0, prediction_status: "draft" },
      ...prev,
    ]);
    setNewCreds({ username, password });
    setName("");
    setMakeAdmin(false);
  }

  async function toggleField(
    userId: string,
    field: "has_paid" | "is_suspended",
    current: boolean,
    config: {
      endpoint: string;
      bodyKey: string;
      errorMsg: string;
      successMsg?: (next: boolean) => string;
    }
  ) {
    const next = !current;
    const apply = (value: boolean) =>
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, [field]: value } : u))
      );
    apply(next);
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, [config.bodyKey]: next }),
    });
    if (!res.ok) {
      apply(current);
      const { error } = await res.json().catch(() => ({ error: null }));
      showToast(error ?? config.errorMsg);
      return;
    }
    if (config.successMsg) showToast(config.successMsg(next));
    router.refresh();
  }

  const togglePaid = (userId: string, currentlyPaid: boolean) =>
    toggleField(userId, "has_paid", currentlyPaid, {
      endpoint: "/api/admin/users/paid",
      bodyKey: "hasPaid",
      errorMsg: "No se pudo actualizar el pago.",
    });

  const toggleSuspended = (userId: string, currentlySuspended: boolean) =>
    toggleField(userId, "is_suspended", currentlySuspended, {
      endpoint: "/api/admin/users/suspended",
      bodyKey: "suspended",
      errorMsg: "No se pudo actualizar el estado.",
      successMsg: (next) =>
        next ? "Pana retirado momentáneamente." : "Pana recolocado.",
    });

  async function removeUser(userId: string, displayName: string) {
    if (!confirm(`¿Eliminar la cuenta de ${displayName}? Esto borra su pronóstico también.`))
      return;
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      showToast("No se pudo eliminar.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    showToast("Cuenta eliminada.");
  }

  async function triggerSync() {
    const res = await fetch("/api/admin/sync", { method: "POST" });
    if (res.ok) showToast("Sync iniciado.");
    else showToast("Falló el sync.");
  }

  return (
    <>
      <ToastHost />
      {newCreds && (
        <CredentialsModal
          username={newCreds.username}
          password={newCreds.password}
          onClose={() => setNewCreds(null)}
        />
      )}

      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-error font-mono">Admin</p>
              <h1 className="text-lg font-bold">Polla Mundial 2026</h1>
            </div>
          </div>
          <Link href="/mi-polla">
            <Button variant="ghost" size="sm">Volver</Button>
          </Link>
          </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-5xl space-y-8">

          <Card>
            <CardHeader>
              <CardTitle>Acciones rápidas</CardTitle>
              <CardDescription>Operaciones manuales sobre el torneo.</CardDescription>
            </CardHeader>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={triggerSync}>Sync resultados ahora</Button>
              <Button variant="outline" disabled>Recalcular puntajes</Button>
              <Button variant="outline" disabled>Forzar reveal</Button>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crear cuenta</CardTitle>
              <CardDescription>
                Solo nombre. El usuario y password se generan automáticamente.
                Se muestran una sola vez — cópialos y compártelos por canal
                privado (WhatsApp / Signal).
              </CardDescription>
            </CardHeader>

            <form onSubmit={createUser} className="flex flex-col sm:flex-row gap-3 items-start">
              <Input
                type="text"
                placeholder="Nombre del pana (ej: Cabezón)"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
              <label className="flex items-center gap-2 text-sm whitespace-nowrap h-11">
                <input
                  type="checkbox"
                  checked={makeAdmin}
                  onChange={(e) => setMakeAdmin(e.target.checked)}
                />
                Admin
              </label>
              <Button type="submit" disabled={creating}>
                {creating ? "Creando…" : "Crear"}
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usuarios ({users.length})</CardTitle>
              <CardDescription>
                Cuentas activas. El estado del pronóstico se actualiza solo.
              </CardDescription>
            </CardHeader>

            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{u.display_name}</p>
                      {u.is_admin && (
                        <span className="text-[10px] uppercase tracking-widest text-error font-mono">
                          admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted truncate font-mono">
                      {u.username ?? "—"}
                    </p>
                  </div>

                  <button
                    onClick={() => togglePaid(u.id, u.has_paid)}
                    className={
                      "rounded-full px-3 py-1 text-xs font-mono uppercase tracking-widest transition-colors cursor-pointer " +
                      (u.has_paid
                        ? "bg-success/20 text-success border border-success/40 hover:bg-success/30"
                        : "bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20")
                    }
                    title="Click para alternar"
                  >
                    {u.has_paid ? "✓ Pagó" : "Sin pagar"}
                  </button>

                  {u.id !== currentUserId && (
                    <button
                      onClick={() => toggleSuspended(u.id, u.is_suspended)}
                      className={
                        "rounded-full px-3 py-1 text-xs font-mono uppercase tracking-widest transition-colors cursor-pointer " +
                        (u.is_suspended
                          ? "bg-error/20 text-error border border-error/40 hover:bg-error/30"
                          : "bg-surface-elevated text-muted border border-border hover:bg-surface")
                      }
                      title={u.is_suspended ? "Recolocar en la polla" : "Retirar momentáneamente"}
                    >
                      {u.is_suspended ? "Recolocar" : "Retirar"}
                    </button>
                  )}

                  <div className="text-right">
                    <p className="font-mono tabular-nums text-sm">{u.total_score} pts</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted">
                      {u.prediction_status === "submitted" ? "enviado" : "borrador"}
                    </p>
                  </div>
                  {u.id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeUser(u.id, u.display_name)}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}

function CredentialsModal({
  username,
  password,
  onClose,
}: {
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = `Polla Mundial 2026\n\nEntrar en: ${origin}\nUsuario: ${username}\nPassword: ${password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="rounded-2xl bg-surface border border-accent p-8 max-w-md w-full space-y-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            ✓ Cuenta creada
          </p>
          <h2 className="text-2xl font-bold mt-2">Copia estas credenciales</h2>
          <p className="text-sm text-muted mt-1">
            Es la única vez que verás el password. Si se pierde, hay que
            eliminar la cuenta y crearla de nuevo.
          </p>
        </div>

        <div className="space-y-3 rounded-lg bg-background border border-border p-4 font-mono text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">Usuario</p>
            <p className="text-lg font-bold">{username}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted">Password</p>
            <p className="text-lg font-bold">{password}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={copy} className="flex-1">
            {copied ? "✓ Copiado" : "Copiar todo"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
