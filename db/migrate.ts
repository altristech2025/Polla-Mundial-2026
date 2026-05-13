/**
 * Migration runner — aplica todos los .sql en db/migrations/ en orden.
 * Uso: `npx tsx db/migrate.ts` (DATABASE_URL debe estar en env).
 *
 * Track de migraciones aplicadas: tabla `_migrations` con nombre + hash + applied_at.
 * Re-correr es idempotente: skip migrations cuyo nombre ya está registrado.
 */
import { Pool } from "@neondatabase/serverless";
import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Missing DATABASE_URL env var");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists _migrations (
        name text primary key,
        hash text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const dir = resolve(__dirname, "migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const applied = await client.query(
        "select 1 from _migrations where name = $1",
        [file]
      );
      if (applied.rowCount && applied.rowCount > 0) {
        console.log(`✓ ${file} (already applied)`);
        continue;
      }
      const content = await readFile(resolve(dir, file), "utf-8");
      const hash = createHash("sha256").update(content).digest("hex");
      console.log(`→ applying ${file} ...`);
      await client.query("begin");
      try {
        await client.query(content);
        await client.query(
          "insert into _migrations (name, hash) values ($1, $2)",
          [file, hash]
        );
        await client.query("commit");
        console.log(`✓ ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }

    console.log("All migrations applied.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
