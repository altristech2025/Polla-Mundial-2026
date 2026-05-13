import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/countdown";
import { BrandLogo } from "@/components/brand-logo";

type ConfigRow = {
  predictions_lock_at: string;
  reveal_at: string;
  tournament_start_at: string;
};

type LeaderRow = {
  user_id: string;
  display_name: string;
  total_score: number;
  score_breakdown: Record<string, number>;
};

export default async function LeaderboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [config] = (await sql`
    select predictions_lock_at, reveal_at, tournament_start_at from app_config where id = 1
  `) as unknown as ConfigRow[];

  const revealed = new Date(config.reveal_at).getTime() <= Date.now();

  if (!revealed) {
    return (
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          <Header />
          <Countdown
            targetIso={config.reveal_at}
            label="Falta para revelar todos los pronósticos"
          />
          <Card className="text-center">
            <h2 className="text-xl font-bold">Aún no se revelan</h2>
            <p className="mt-2 text-sm text-muted">
              Hasta el 11 de junio a las 00:00 (Quito) cada quien sigue ajustando
              su pronóstico en secreto. Después aparece el comparativo.
            </p>
            <Link href="/mi-polla" className="mt-6 inline-block">
              <Button>Volver a mi polla</Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  const leaders = (await sql`
    select p.user_id, u.display_name, p.total_score, p.score_breakdown
    from predictions p
    join users u on u.id = p.user_id
    where p.status = 'submitted'
    order by p.total_score desc, u.display_name asc
  `) as unknown as LeaderRow[];

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <Header />
        <Card>
          <h2 className="text-2xl font-bold">Tabla general</h2>
          <p className="text-sm text-muted mt-1">
            Puntos se actualizan automáticamente conforme avanzan los partidos.
          </p>
          <div className="mt-6">
            {leaders.length === 0 ? (
              <p className="text-muted text-sm">
                Nadie ha enviado su pronóstico definitivo todavía.
              </p>
            ) : (
              <table className="w-full">
                <thead className="border-b border-border text-xs uppercase tracking-widest text-muted">
                  <tr>
                    <th className="py-2 text-left w-8">#</th>
                    <th className="py-2 text-left">Jugador</th>
                    <th className="py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((l, i) => (
                    <tr
                      key={l.user_id}
                      className={
                        l.user_id === session.user.id
                          ? "border-b border-border bg-accent/5"
                          : "border-b border-border"
                      }
                    >
                      <td className="py-3 font-mono text-muted">
                        {i + 1 === 1 ? "🥇" : i + 1 === 2 ? "🥈" : i + 1 === 3 ? "🥉" : i + 1}
                      </td>
                      <td className="py-3 font-medium">{l.display_name}</td>
                      <td className="py-3 text-right font-mono tabular-nums font-bold">
                        {l.total_score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <BrandLogo className="h-8" />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
            Polla Mundial 2026
          </p>
          <h1 className="text-3xl font-bold">Leaderboard</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/resultados">
          <Button variant="ghost" size="sm">Resultados</Button>
        </Link>
        <Link href="/reglas">
          <Button variant="ghost" size="sm">Reglas</Button>
        </Link>
        <Link href="/mi-polla">
          <Button variant="ghost" size="sm">Mi polla</Button>
        </Link>
      </div>
    </header>
  );
}
