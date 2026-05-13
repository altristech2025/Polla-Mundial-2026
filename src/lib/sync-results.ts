/**
 * Sync de resultados oficiales — pipeline: football-data.org → API-Football → manual.
 *
 * Para MVP queda como placeholder: deja de log en scores_audit. Tras tener un
 * partido jugado real, conectar la API y normalizar nombres contra teams.code.
 *
 * Las llaves esperadas:
 *   FOOTBALL_DATA_API_TOKEN — registrarse en football-data.org
 *   API_FOOTBALL_KEY        — registrarse en API-Football (rapidapi)
 */

import { sql } from "@/lib/db";
import { recomputeAllScores } from "@/lib/scoring-recompute";

export type SyncSource = "cron" | "admin-manual";

type SyncResult = {
  ok: boolean;
  source: string;
  matchesUpdated: number;
  warnings: string[];
};

export async function syncResults({
  source,
}: {
  source: SyncSource;
}): Promise<SyncResult> {
  const warnings: string[] = [];
  let matchesUpdated = 0;

  try {
    // TODO: implementar fetch real cuando estemos cerca del Mundial
    // Por ahora solo logueamos el intento de sync.
    await sql`
      insert into scores_audit (event, source, payload, status, message)
      values (
        'sync_results_attempted',
        ${source},
        '{}'::jsonb,
        'ok',
        'Placeholder sync — no APIs wired yet'
      )
    `;

    // Recalcular puntajes con resultados actuales (lo que esté en DB)
    matchesUpdated = await recomputeAllScores();

    return { ok: true, source, matchesUpdated, warnings };
  } catch (err) {
    await sql`
      insert into scores_audit (event, source, payload, status, message)
      values (
        'sync_results_failed',
        ${source},
        '{}'::jsonb,
        'error',
        ${(err as Error).message}
      )
    `;
    return {
      ok: false,
      source,
      matchesUpdated: 0,
      warnings: [...warnings, (err as Error).message],
    };
  }
}
