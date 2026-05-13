/**
 * Auth.js v5 — credentials provider con bcrypt + JWT session.
 * Login con username + password. Admin entrega ambos por canal privado.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      displayName: string;
    } & DefaultSession["user"];
  }
}

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  is_admin: boolean;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/",
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = (credentials?.username as string)?.toLowerCase().trim();
        const password = credentials?.password as string;
        if (!username || !password) return null;

        const rows = (await sql`
          select id, username, password_hash, display_name, is_admin
          from users where lower(username) = ${username} limit 1
        `) as unknown as UserRow[];

        const user = rows[0];
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.display_name,
          isAdmin: user.is_admin,
          displayName: user.display_name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
        token.isAdmin = (user as { isAdmin: boolean }).isAdmin;
        token.displayName = (user as { displayName: string }).displayName;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.isAdmin = (token.isAdmin as boolean) ?? false;
        session.user.displayName = (token.displayName as string) ?? "";
      }
      return session;
    },
  },
});
