import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isAdmin) return null;
  return session;
}

function generatePassword(slug: string): string {
  const digits = String(randomInt(100, 1000));
  return slug + digits;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { displayName, isAdmin } = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    isAdmin?: boolean;
  };
  const name = displayName?.trim();
  if (!name) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }

  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
  }

  // username = slug puro. Si choca con alguno existente, agrega 2 dígitos.
  let username = slug;
  const taken = (await sql`
    select 1 from users where lower(username) = ${slug.toLowerCase()} limit 1
  `) as Array<unknown>;
  if (taken.length > 0) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = slug + String(randomInt(10, 100));
      const existing = (await sql`
        select 1 from users where lower(username) = ${candidate.toLowerCase()} limit 1
      `) as Array<unknown>;
      if (existing.length === 0) {
        username = candidate;
        break;
      }
    }
    if (username === slug) {
      return NextResponse.json(
        { error: "No se pudo generar usuario único." },
        { status: 500 }
      );
    }
  }

  const password = generatePassword(slug);
  const hash = await bcrypt.hash(password, 10);

  const inserted = (await sql`
    insert into users (email, username, password_hash, display_name, is_admin, has_paid)
    values (
      ${`${username}@polla.local`},
      ${username},
      ${hash},
      ${name},
      ${isAdmin ?? false},
      false
    )
    returning id, username, display_name, is_admin, has_paid, created_at
  `) as Array<{
    id: string;
    username: string;
    display_name: string;
    is_admin: boolean;
    has_paid: boolean;
    created_at: string;
  }>;
  const user = inserted[0];

  await sql`insert into predictions (user_id) values (${user.id})`;

  return NextResponse.json({
    user: { ...user, email: `${username}@polla.local` },
    username,
    password,
  });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const session = await auth();
  if (session?.user?.id === userId) {
    return NextResponse.json(
      { error: "No puedes eliminarte a ti mismo." },
      { status: 400 }
    );
  }

  await sql`delete from users where id = ${userId}`;
  return NextResponse.json({ ok: true });
}
