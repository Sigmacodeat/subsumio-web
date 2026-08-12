import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * /dashboard/admin/* — Server-Side Role-Guard.
 *
 * Zweite Verteidigungslinie nach der Edge-Middleware:
 *   1. Middleware: Session + Role-Check (redirect auf /dashboard)
 *   2. Layout:     Server-Side getSessionUser() + Role-Check (redirect auf /dashboard)
 *   3. API:        createHandler({ action: "admin.*" }) → 403
 *
 * Alle drei Schichten müssen durch — ein Bypass in einer Schicht
 * wird von der nächsten abgefangen.
 */
export default async function DashboardAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/dashboard/admin");
  if (me.role !== "admin") redirect("/dashboard");

  return <>{children}</>;
}
