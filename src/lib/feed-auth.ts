/**
 * Shared validation for secret-token feed routes (`/api/calendar/<token>/…`).
 *
 * The token format is `<userId>.<secret>`; only the SHA-256 of the secret is
 * stored. A valid token resolves to the engine headers of that user, so every
 * downstream read is scoped to exactly the matters they may see.
 *
 * Two token kinds, each with its own stored hash and its own scope:
 *
 *  - Calendar link (`calendarFeedTokenHash`, created on
 *    /dashboard/calendar-export): scope "calendar" ONLY — the deadline feed
 *    `fristen.ics`. This link is handed to Google/Outlook/Apple, i.e. to a
 *    third party, so it must never open the document archive.
 *  - DAV access (`davTokenHash`, created separately and explicitly): scope
 *    "documents" + "calendar" — the read-only WebDAV/CalDAV bridge
 *    (scripts/dav-server.ts) uses one password for /dokumente/ and /fristen/.
 *
 * Calendar links created before the split carried no scope and were accepted
 * by the document routes; they are now calendar-only by construction (the
 * document routes only compare against davTokenHash), with no data migration.
 */

import { getStore, type User } from "@/lib/auth/store";
import { engineHeadersForUserId } from "@/lib/engine";
import { hashFeedSecret, parseFeedToken, secretsMatch } from "@/lib/calendar-feed";
import { hit } from "@/lib/auth/rate-limit";

/** What a feed request wants to read. */
export type FeedScope = "calendar" | "documents";

export type FeedTokenKind = "calendar" | "dav";

export type FeedAuthResult =
  | { ok: true; userId: string; headers: Record<string, string>; kind: FeedTokenKind }
  | { ok: false; status: 404 | 429 | 502 };

/** Which token kinds may read which scope. */
const KINDS_FOR_SCOPE: Record<FeedScope, readonly FeedTokenKind[]> = {
  calendar: ["calendar", "dav"],
  documents: ["dav"],
};

function storedHash(user: User, kind: FeedTokenKind): string | null | undefined {
  return kind === "dav" ? user.davTokenHash : user.calendarFeedTokenHash;
}

/**
 * Validate a `<userId>.<secret>` feed token for the given scope. Fails
 * closed: an unknown user, a revoked link, a token of the wrong kind, a
 * missing engine binding and a malformed token all answer the same 404 —
 * the response does not disclose which part failed.
 */
export async function resolveFeedToken(token: string, scope: FeedScope): Promise<FeedAuthResult> {
  const parsed = parseFeedToken(token ?? "");
  if (!parsed) return { ok: false, status: 404 };

  // A wrong secret must not be cheap to guess at scale.
  const rate = await hit(`calendar-feed:${parsed.userId}`, 60, 60_000);
  if (!rate.ok) return { ok: false, status: 429 };

  const store = getStore();
  const user = await store.getById(parsed.userId);
  if (!user) return { ok: false, status: 404 };

  const presented = await hashFeedSecret(parsed.secret);
  // Compare against every kind this scope allows (constant-time each).
  let kind: FeedTokenKind | null = null;
  for (const candidate of KINDS_FOR_SCOPE[scope]) {
    if (secretsMatch(presented, storedHash(user, candidate))) kind = candidate;
  }
  if (!kind) return { ok: false, status: 404 };

  const engine = await engineHeadersForUserId(parsed.userId);
  if (!engine) return { ok: false, status: 404 };

  // Best effort: shows in the settings when a client last used the link.
  const now = new Date().toISOString();
  void store
    .update(
      parsed.userId,
      kind === "dav" ? { davTokenLastUsedAt: now } : { calendarFeedLastUsedAt: now }
    )
    .catch(() => {});

  return { ok: true, userId: parsed.userId, headers: engine.headers, kind };
}
