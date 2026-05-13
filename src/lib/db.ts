/**
 * Neon Postgres client compartido (serverless HTTP). Una sola conexión
 * global, optimizada para Vercel edge/serverless.
 */
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(process.env.DATABASE_URL);
