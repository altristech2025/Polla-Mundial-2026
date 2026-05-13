import { redirect } from "next/navigation";

// Backward-compat: /login → /
export default function LegacyLogin() {
  redirect("/");
}
