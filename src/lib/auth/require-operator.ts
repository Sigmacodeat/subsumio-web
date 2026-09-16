import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import type { PublicUser } from "@/lib/auth/store";
import { isOpsHost, isPlatformOperator } from "@/lib/auth/platform-operator";

/**
 * Server-side guard for the operator console (/ops).
 *
 * Unauthenticated → login (back to the console). Signed in but not a platform
 * operator, or not on the ops host in production → 404, so the console's
 * existence is not revealed to firm users.
 */
export async function requirePlatformOperator(nextPath = "/ops"): Promise<PublicUser> {
  if (process.env.NODE_ENV === "production") {
    const host = (await headers()).get("host");
    if (!isOpsHost(host)) notFound();
  }
  const me = await getSessionUser();
  if (!me) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!isPlatformOperator(me)) notFound();
  return me;
}
