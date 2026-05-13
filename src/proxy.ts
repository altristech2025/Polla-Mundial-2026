import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const url = req.nextUrl.clone();
  const isPublic =
    url.pathname === "/" ||
    url.pathname.startsWith("/api/auth") ||
    url.pathname === "/api/warmup";

  if (!req.auth && !isPublic) {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
