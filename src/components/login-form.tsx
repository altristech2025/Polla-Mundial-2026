"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Warm-up de Neon mientras escribe → cold start no afecta al login
  useEffect(() => {
    fetch("/api/warmup").catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    router.push("/mi-polla");
    router.refresh();
  }

  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-left">
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-muted font-mono" htmlFor="username">
          Usuario
        </label>
        <Input
          id="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest text-muted font-mono" htmlFor="password">
          Contraseña
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {canSubmit && (
        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading ? "Entrando…" : "Entrar"}
        </Button>
      )}
    </form>
  );
}
