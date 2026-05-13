import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/brand-logo";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) {
    // JWT podría apuntar a un user borrado (p.ej. después de un reseed).
    // Solo redirigimos a /mi-polla si el user realmente existe en DB.
    const [u] = (await sql`
      select 1 as ok from users where id = ${session.user.id} limit 1
    `) as Array<{ ok: number }>;
    if (u) redirect("/mi-polla");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-10 text-center">
        <div className="flex justify-center">
          <BrandLogo className="h-12" />
        </div>
        <div className="space-y-3">
          <p className="text-sm font-mono uppercase tracking-[0.3em] text-accent">
            Mundial 2026
          </p>
          <h1 className="text-5xl font-bold tracking-tight">
            La polla
            <br />
            <span className="text-accent">de los panas.</span>
          </h1>
        </div>

        <LoginForm />

        <p className="text-xs text-muted font-mono">
          Cuenta solo con invitación. Ernesto te manda tu usuario y password por privado.
        </p>

        <div className="pt-2 space-y-3 border-t border-border/60">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
              Pago de la polla
            </p>
            <p className="text-sm text-foreground font-medium">
              Escanea para pagar por Deuna
            </p>
          </div>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/qr-deuna.jpeg"
              alt="Código QR para pagar la polla por Deuna"
              className="w-48 h-48 rounded-xl border border-border bg-white p-2 shadow-[0_4px_24px_rgba(168,255,62,0.10)]"
            />
          </div>
          <p className="text-xs text-muted">
            Abre la app Deuna y escanea el QR con tu cámara.
          </p>
        </div>
      </div>
    </main>
  );
}
