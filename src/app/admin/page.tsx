import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { AdminClient } from "./admin-client";

type UserRow = {
  id: string;
  username: string | null;
  display_name: string;
  is_admin: boolean;
  has_paid: boolean;
  created_at: string;
  total_score: number;
  prediction_status: string | null;
};

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.isAdmin) redirect("/mi-polla");

  const users = (await sql`
    select
      u.id,
      u.username,
      u.display_name,
      u.is_admin,
      u.has_paid,
      u.created_at::text,
      coalesce(p.total_score, 0) as total_score,
      p.status as prediction_status
    from users u
    left join predictions p on p.user_id = u.id
    order by u.created_at desc
  `) as unknown as UserRow[];

  return <AdminClient initialUsers={users} currentUserId={session.user.id} />;
}
