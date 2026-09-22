/**
 * Shared validation for secret-token feed routes (`/api/calendar/<token>/…`).
 *
 * The token format is `<userId>.<secret>`; only the SHA-256 of the secret is
 * stored. A valid token resolves to the engine headers of that user, so every
 * downstream read is scoped to exactly the matters they may see.
 */

import { getStore } from "@/lib/auth/store";
import { engineHeadersForUserId } from "@/lib/engine";
import { hashFeedSecret, parseFeedToken, secretsMatch } from "@/lib/calendar-feed";
import { hit } from "@/lib/auth/rate-limit";

export type FeedAuthResult =
  | { ok: true; userId: string; headers: Record<string, string> }
  | { ok: false; status: 404 | 429 | 502 };

/**
 * Validate a `<userId>.<secret>` feed token. Fails closed: an unknown user,
 * a revoked link, a missing engine binding and a malformed token all answer
 * the same 404 — the response does not disclose which part failed.
 */
export async function resolveFeedToken(token: string): Promise<FeedAuthResult> {
  const parsed = parseFeedToken(token ?? "");
  if (!parsed) return { ok: false, status: 404 };

  // A wrong secret must not be cheap to guess at scale.
  const rate = await hit(`calendar-feed:${parsed.userId}`, 60, 60_000);
  if (!rate.ok) return { ok: false, status: 429 };

  const store = getStore();
  const user = await store.getById(parsed.userId);
  if (!user?.calendarFeedTokenHash) return { ok: false, status: 404 };

  const presented = await hashFeedSecret(parsed.secret);
  if (!secretsMatch(presented, user.calendarFeedTokenHash)) return { ok: false, status: 404 };

  const engine = await engineHeadersForUserId(parsed.userId);
  if (!engine) return { ok: false, status: 404 };

  // Best effort: shows in the settings when a client last used the link.
  void store
    .update(parsed.userId, { calendarFeedLastUsedAt: new Date().toISOString() })
    .catch(() => {});

  return { ok: true, userId: parsed.userId, headers: engine.headers };
}
