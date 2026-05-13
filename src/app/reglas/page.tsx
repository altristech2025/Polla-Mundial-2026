/**
 * Reglas de la polla — clasificación, estructura del bracket, sistema de
 * puntos y fechas clave. Pública (con login).
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { POINTS, MAX_POSSIBLE_SCORE } from "@/lib/scoring";

type ConfigRow = {
  predictions_lock_at: string;
  reveal_at: string;
  tournament_start_at: string;
};

const dateFmt = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ReglasPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [config] = (await sql`
    select predictions_lock_at, reveal_at, tournament_start_at from app_config where id = 1
  `) as unknown as ConfigRow[];

  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-8" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-mono">
                Reglas
              </p>
              <h1 className="mt-2 text-3xl font-bold">Cómo funciona la polla</h1>
              <p className="mt-2 text-muted max-w-xl">
                Todo lo que tienes que saber para no preguntar después: clasificación,
                bracket, puntos y fechas.
              </p>
            </div>
          </div>
          <Link href="/mi-polla">
            <Button variant="ghost" size="sm">Volver a Mi polla</Button>
          </Link>
        </header>

        <Card>
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            1. Fase de grupos del Mundial
          </p>
          <h2 className="mt-2 text-xl font-bold">Cómo se clasifican los 32</h2>
          <div className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
            <p>
              El Mundial 2026 es el <strong>primero con 48 selecciones</strong> (los
              anteriores fueron de 32). Se juega en <strong>Estados Unidos, Canadá
              y México</strong> — los tres países anfitriones tienen plaza directa. En
              total son <strong>16 sedes</strong>: 11 en USA (Atlanta, Boston, Dallas,
              Houston, Kansas City, Los Ángeles, Miami, Nueva York, Philadelphia, San
              Francisco, Seattle), 2 en Canadá (Toronto, Vancouver) y 3 en México (CDMX,
              Guadalajara, Monterrey). Son <strong>104 partidos</strong> en 39 días —
              el Mundial más grande de la historia.
            </p>
            <p>
              Las 48 selecciones se reparten en <strong>12 grupos (A–L) de 4 equipos
              cada uno</strong>. Cada grupo juega round-robin (todos contra todos): son
              6 partidos por grupo, <strong>72 partidos totales</strong> de fase de
              grupos. Puntos clásicos: 3 por victoria, 1 por empate, 0 por derrota.
            </p>
            <p>
              A la siguiente ronda (16avos / R32) pasan:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Los <strong>2 primeros de cada grupo</strong> (24 equipos).</li>
              <li>Los <strong>8 mejores terceros</strong> de los 12 grupos — entre los 12 terceros que terminaron en esa posición, los 8 con mejor récord avanzan; los otros 4 quedan eliminados.</li>
              <li>Total: <strong>32 equipos</strong> que avanzan a 16avos de final.</li>
            </ul>
            <p>
              <strong>Tiebreakers FIFA</strong> aplicados en este orden estricto:
              puntos → diferencia de goles → goles a favor → resultado en el duelo
              directo (cuando empatan equipos del mismo grupo) → fair play → sorteo.
              Para rankear los 12 terceros se usan los mismos criterios pero el "duelo
              directo" no aplica (están en grupos distintos).
            </p>
            <p>
              En la app, tus marcadores de fase de grupos arman{" "}
              <strong>automáticamente</strong> los cruces de 16avos (P73–P88) según la
              tabla oficial de la FIFA. No tienes que elegir manualmente quién enfrenta
              a quién — el algoritmo lo resuelve.
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            2. Cómo se arman las llaves
          </p>
          <h2 className="mt-2 text-xl font-bold">Camino al campeón</h2>
          <div className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Cuando se cierran los 72 partidos de fase de grupos, la FIFA conoce los
              32 clasificados. La tabla oficial del Mundial 2026 define{" "}
              <strong>cruces fijos</strong> entre primeros, segundos y los 8 mejores
              terceros. Por ejemplo:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-xs">
              <li><strong>2° A vs 2° B</strong> (cruce P73).</li>
              <li><strong>1° E vs el mejor 3°</strong> que aplique a su slot (P74).</li>
              <li><strong>1° F vs 2° C</strong> (P75).</li>
              <li>…y así con los 16 cruces de R32.</li>
            </ul>
            <p>
              Los 8 mejores terceros no van a cualquier slot. La FIFA publica una
              <strong> tabla de elegibilidad</strong>: cada slot de "mejor tercero"
              admite solo terceros de ciertos grupos (para evitar que dos equipos del
              mismo grupo se vuelvan a enfrentar tan rápido o que la geografía
              desbalancee el bracket). La asignación final se resuelve con un algoritmo
              que busca una combinación válida.
            </p>
            <p>
              <strong>El bracket en sí es lineal después de R32</strong> — gana y avanzas,
              pierdes y te vas. Las dos "mitades" del bracket (izquierda y derecha, cada
              una con 8 cruces de R32) confluyen solo en la final. La FIFA dibuja eso
              como "dos caminos a la copa".
            </p>
            <p className="pt-2 border-t border-border/40">
              <span className="font-bold text-foreground">Rondas (codes internos de la app):</span>
            </p>
            <ul className="space-y-2">
              <li>
                <span className="font-mono text-foreground">P73–P88</span> · <strong>16avos (R32)</strong> — 16 partidos. <strong>Esta ronda es nueva en 2026</strong> (en formatos anteriores de 32 equipos se entraba directo a octavos).
              </li>
              <li>
                <span className="font-mono text-foreground">P89–P96</span> · <strong>Octavos (R16)</strong> — 8 partidos.
              </li>
              <li>
                <span className="font-mono text-foreground">P97–P100</span> · <strong>Cuartos (QF)</strong> — 4 partidos.
              </li>
              <li>
                <span className="font-mono text-foreground">P101, P102</span> · <strong>Semifinal (SF)</strong> — 2 partidos. Los ganadores van a la Final; los perdedores juegan por el 3°.
              </li>
              <li>
                <span className="font-mono text-foreground">P103</span> · <strong>Tercer puesto</strong> — ganador = 3°, perdedor = 4°.
              </li>
              <li>
                <span className="font-mono text-foreground">P104</span> · <strong>Final</strong> — ganador = campeón, perdedor = subcampeón. Se juega en el MetLife Stadium (Nueva Jersey) el 19 de julio de 2026.
              </li>
            </ul>
            <p className="text-xs pt-2 border-t border-border/40">
              En la eliminación directa, cualquier partido empatado al final del tiempo
              reglamentario va a alargue (2 × 15 min). Si sigue empatado, se define en
              penales. En la app, tú solo marcas el ganador final del cruce con un click
              — la propagación al siguiente cruce es automática. Si después cambias algo
              aguas arriba, los picks aguas abajo se invalidan (aparecen con borde rojo).
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            3. Sistema de puntos
          </p>
          <h2 className="mt-2 text-xl font-bold">Cuánto vale cada acierto</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-2 pr-4 text-xs uppercase tracking-widest text-muted font-mono font-normal">Logro</th>
                  <th className="py-2 text-xs uppercase tracking-widest text-muted font-mono font-normal text-right">Puntos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                <tr>
                  <td className="py-2 pr-4">Predecir que un equipo pasa a 16avos (R32)</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.R32_PASS}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">+ Bonus si acertaste la posición exacta (1° / 2° / mejor 3°)</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums text-accent">+{POINTS.R32_POSITION_BONUS}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir que un equipo pasa a Octavos (R16)</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.R16}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir que un equipo pasa a Cuartos</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.QF}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir que un equipo pasa a Semifinal</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.SF}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir que un equipo está en la Final</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.FINAL}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir el Tercer puesto</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.THIRD}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir el Cuarto puesto</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.FOURTH}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir el Subcampeón</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums">{POINTS.RUNNER_UP}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Predecir el Campeón</td>
                  <td className="py-2 text-right font-mono font-bold tabular-nums text-accent">{POINTS.CHAMPION}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-3 pr-4 font-bold">Máximo teórico</td>
                  <td className="py-3 text-right font-mono font-bold tabular-nums text-accent text-lg">{MAX_POSSIBLE_SCORE}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted">
            Los puntos se acumulan automáticamente conforme avanza el Mundial: cuando un
            equipo que predijiste avanza a una ronda, sumas los puntos de esa ronda. No
            hay penalizaciones por errar — solo se premia acertar.
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            4. Cómo se validó el sistema de puntos
          </p>
          <h2 className="mt-2 text-xl font-bold">Por qué el scoring es justo</h2>
          <div className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
            <p>
              Antes de poner la app en producción, el motor de puntos fue probado contra
              un Mundial teórico con <strong>tres agentes ficticios</strong> que llenaron
              los 72 marcadores + 32 picks del bracket con estrategias muy distintas:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Favorito</strong>: siempre vota por el equipo más fuerte (mayor ranking) de cada cruce.
              </li>
              <li>
                <strong>Caos</strong>: marcadores y picks totalmente aleatorios — la "sopa" de la polla.
              </li>
              <li>
                <strong>Mixto</strong>: prioriza favoritos en fase de grupos, pero mete caballos negros en eliminación.
              </li>
            </ul>
            <p>
              Sus predicciones se evaluaron contra un Mundial teórico (Argentina campeón,
              Brasil subcampeón, Bélgica 3°, Francia 4°) y se validaron varios invariantes:
              el que acertó el campeón siempre gana; los favoritistas puntúan claramente
              más alto que los caóticos; el spread entre el primero y el último es
              razonable (no es trivial ganar ni imposible perder).
            </p>
            <p>
              Si alguno de esos invariantes hubiera fallado, el test no pasaba y no
              salíamos a producción. Resultado típico: <strong>Favorito &gt; Mixto &gt; Caos</strong>.
              El sistema considera justos los aciertos y deja espacio para los caballos
              negros (los "mixtos" pueden ganar si arriesgan bien).
            </p>
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-widest text-accent font-mono">
            5. Fechas clave
          </p>
          <h2 className="mt-2 text-xl font-bold">Cuándo pasa qué</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between gap-4 border-b border-border/60 pb-3">
              <div>
                <p className="font-medium text-foreground">Lock para enviar pronóstico</p>
                <p className="text-xs text-muted mt-1">Después de esto, nadie puede enviar más predicciones.</p>
              </div>
              <p className="font-mono text-xs tabular-nums whitespace-nowrap text-right">
                {dateFmt.format(new Date(config.predictions_lock_at))}
              </p>
            </li>
            <li className="flex justify-between gap-4 border-b border-border/60 pb-3">
              <div>
                <p className="font-medium text-foreground">Reveal de pronósticos</p>
                <p className="text-xs text-muted mt-1">
                  Las predicciones de cada pana se vuelven públicas (página{" "}
                  <span className="font-mono">/pronosticos</span>).
                </p>
              </div>
              <p className="font-mono text-xs tabular-nums whitespace-nowrap text-right">
                {dateFmt.format(new Date(config.reveal_at))}
              </p>
            </li>
            <li className="flex justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Kickoff del Mundial</p>
                <p className="text-xs text-muted mt-1">
                  Empiezan los partidos. La página{" "}
                  <span className="font-mono">/resultados</span> se enciende y muestra el
                  tracking live.
                </p>
              </div>
              <p className="font-mono text-xs tabular-nums whitespace-nowrap text-right">
                {dateFmt.format(new Date(config.tournament_start_at))}
              </p>
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">
            Las fechas son zona horaria <strong>Quito (UTC-5)</strong> y están
            centralizadas en la tabla <span className="font-mono">app_config</span> de la
            base de datos.
          </p>
        </Card>
      </div>
    </main>
  );
}
