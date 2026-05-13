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
      </div>
    </main>
  );
}
