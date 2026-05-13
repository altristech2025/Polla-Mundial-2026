/**
 * Warm-up query para mitigar el cold start de Neon free tier.
 * Se llama desde /login al montar para que cuando el usuario apriete Entrar
 * el DB ya esté caliente.
 */
import { sql } from "@/lib/db";

export async function GET() {
  try {
    await sql`select 1`;
  } catch {
    // ignore — best effort
  }
  return Response.json({ ok: true });
}
