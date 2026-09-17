// Server-side auth helpers for route handlers and server components.

import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import { getStore, toPublic, type PublicUser } from "./store";
import { isAccountBlocked } from "./account-status";

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function getSessionUser(): Promise<PublicUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await getStore().getById(session.uid);
  if (!user || (await isAccountBlocked(user))) return null;
  return toPublic(user);
}
