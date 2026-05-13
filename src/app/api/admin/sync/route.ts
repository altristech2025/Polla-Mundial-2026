import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncResults } from "@/lib/sync-results";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await syncResults({ source: "admin-manual" });
  return NextResponse.json(result);
}
