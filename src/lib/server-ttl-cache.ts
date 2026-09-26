/**
 * Small per-process cache for expensive read models (badge counts, deadline
 * warnings): concurrent requests for the same key share one load, and a
 * result is reused for `ttlMs`. Failed loads are not cached. The key must
 * encode everything that changes the answer — in particular the caller's
 * access (engine headers), so a result is never served across access scopes.
 */
export interface TtlCache<T> {
  get(key: string, load: () => Promise<T>): Promise<T>;
  /** Drop every entry whose key starts with `prefix` (e.g. one firm's). */
  invalidate(prefix?: string): void;
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 1_000): TtlCache<T> {
  const done = new Map<string, { at: number; value: T }>();
  const inFlight = new Map<string, Promise<T>>();
  return {
    get(key, load) {
      const hit = done.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);
      const running = inFlight.get(key);
      if (running) return running;
      const p = (async () => {
        try {
          const value = await load();
          if (done.size >= maxEntries) {
            // Evict the oldest entry (Map keeps insertion order).
            const first = done.keys().next().value;
            if (first !== undefined) done.delete(first);
          }
          done.delete(key);
          done.set(key, { at: Date.now(), value });
          return value;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, p);
      return p;
    },
    invalidate(prefix) {
      if (prefix === undefined) {
        done.clear();
        return;
      }
      for (const k of done.keys()) if (k.startsWith(prefix)) done.delete(k);
    },
  };
}

/**
 * Stable cache-key fragment for a caller's engine headers: brain, access and
 * identity — but not the per-request parts. The signed identity token carries
 * an expiry that changes every second; its payload minus `exp` is what
 * decides access, so that is what goes into the key. The shared engine API
 * key (same for everyone, and it must not sit in a map key) and the
 * per-request correlation id are left out.
 */
export function headersCacheKey(headers: Record<string, string>): string {
  const parts: Array<[string, string]> = [];
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    // Per-request correlation id and the shared engine key never decide access.
    if (key === "x-subsumio-api-key" || key === "x-request-id") continue;
    if (key === "x-subsumio-identity-token") {
      parts.push([key, identityPayloadWithoutExp(value)]);
      continue;
    }
    parts.push([key, value]);
  }
  parts.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(parts);
}

function identityPayloadWithoutExp(token: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")
    ) as Record<string, unknown>;
    delete payload.exp;
    return JSON.stringify(Object.entries(payload).sort(([a], [b]) => (a < b ? -1 : 1)));
  } catch {
    // Unreadable token: never share — the raw token keys only itself.
    return token;
  }
}
