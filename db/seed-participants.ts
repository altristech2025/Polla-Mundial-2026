/**
 * Reseed total de participantes. Borra usuarios existentes y crea 10 con
 * credenciales fáciles de recordar:
 *   - username = nombre_lowercase + 3 dígitos aleatorios   (ej: chino384)
 *   - password = nombre_lowercase + 3 dígitos aleatorios   (ej: chino712)
 *
 * Imprime la tabla de credenciales para que Ernesto las comparta por WhatsApp.
 */
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const PARTICIPANTS: Array<{ display: string; slug: string; isAdmin?: boolean }> = [
  { display: "Ernesto", slug: "ernesto", isAdmin: true },
  { display: "Chino", slug: "chino" },
  { display: "Cabezón", slug: "cabezon" },
  { display: "Cueva", slug: "cueva" },
  { display: "Hernán", slug: "hernan" },
  { display: "Baquero", slug: "baquero" },
  { display: "López", slug: "lopez" },
  { display: "Perujo", slug: "perujo" },
  { display: "Julio", slug: "julio" },
  { display: "Varea", slug: "varea" },
];

function threeDigits(): string {
  return String(randomInt(100, 1000));
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Borrando usuarios existentes…");
  await sql`delete from users`;
  await sql`delete from allowed_participants`;
  console.log("  ✓ tabla users + allowed_participants vaciadas\n");

  console.log("Creando 10 participantes…\n");
  console.log("=== CREDENCIALES POLLA MUNDIAL 2026 ===");
  console.log("⚠️  Compártelas por canal privado (WhatsApp/Signal). NO email público.\n");

  const rows: Array<{ display: string; username: string; password: string; admin: boolean }> = [];
  for (const p of PARTICIPANTS) {
    const username = p.slug;
    const password = p.slug + threeDigits();
    const hash = await bcrypt.hash(password, 10);

    const inserted = (await sql`
      insert into users (email, username, password_hash, display_name, is_admin, has_paid)
      values (
        ${`${username}@polla.local`},
        ${username},
        ${hash},
        ${p.display},
        ${p.isAdmin ?? false},
        false
      )
      returning id
    `) as Array<{ id: string }>;
    const userId = inserted[0].id;

    await sql`insert into predictions (user_id) values (${userId})`;
    rows.push({ display: p.display, username, password, admin: p.isAdmin ?? false });
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`  ${pad("Nombre", 14)} ${pad("Usuario", 14)} ${pad("Password", 14)} Admin`);
  console.log("  " + "─".repeat(60));
  for (const r of rows) {
    console.log(
      `  ${pad(r.display, 14)} ${pad(r.username, 14)} ${pad(r.password, 14)} ${r.admin ? "✓" : ""}`
    );
  }
  console.log("\n========================================\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
