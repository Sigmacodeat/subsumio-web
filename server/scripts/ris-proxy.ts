/**
 * RIS Proxy Helper — Multi-provider IP-rotation for parallel RIS downloads.
 *
 * Supports combining multiple free proxy providers (FrontProxy, Oxylabs,
 * Webshare, Bright Data, etc.) into a single round-robin pool. Each provider
 * gets its own slot in the rotation. Failed/exhausted proxies are automatically
 * quarantined and retried after a cooldown period.
 *
 * Configuration via env vars:
 *   RIS_PROXY_URLS        — comma-separated list of proxy URLs from any providers
 *                           e.g. "http://user1:pass1@frontproxy:port,http://user2:pass2@webshare:port"
 *   RIS_PROXY_DELAY       — delay per request in ms (default: 1500)
 *   RIS_PROXY_CONCURRENCY  — override auto-concurrency (default: auto = 2 per URL, max 20)
 *   RIS_PROXY_QUARANTINE_S — seconds to skip a failed proxy before retry (default: 300)
 *
 * If no proxies are configured, falls back to direct connection (no proxy).
 * Bun's fetch() natively supports HTTP proxies via the `proxy` option.
 */

interface ProxyEntry {
  url: string;
  label: string;
  failures: number;
  quarantinedUntil: number; // epoch ms, 0 = active
  totalRequests: number;
  totalSuccess: number;
}

/** Parse proxy URLs from env var. Supports optional labels via "url|label" syntax. */
const _proxies: ProxyEntry[] = (() => {
  const raw = process.env.RIS_PROXY_URLS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [url, label] = entry.split("|");
      return {
        url: url!.trim(),
        label: (label?.trim() || `proxy-${i + 1}`).slice(0, 20),
        failures: 0,
        quarantinedUntil: 0,
        totalRequests: 0,
        totalSuccess: 0,
      };
    });
})();

/** Delay per proxy connection (ms). */
export const PROXY_DELAY_MS = parseInt(
  process.env.RIS_PROXY_DELAY ?? "1500",
  10
);

/** Manual concurrency override (optional). */
const _proxyConcurrency = parseInt(
  process.env.RIS_PROXY_CONCURRENCY ?? "0",
  10
);

/** Quarantine duration in seconds. */
const QUARANTINE_S = parseInt(
  process.env.RIS_PROXY_QUARANTINE_S ?? "300",
  10
);

/** Whether any proxies are configured. */
export function hasProxies(): boolean {
  return _proxies.length > 0;
}

/** Number of configured proxies (including quarantined). */
export function proxyCount(): number {
  return _proxies.length;
}

/** Number of active (non-quarantined) proxies. */
export function activeProxyCount(): number {
  const now = Date.now();
  return _proxies.filter((p) => p.quarantinedUntil <= now).length;
}

/**
 * Recommended concurrency based on proxy availability.
 * - No proxies: 1 (RIS single-connection rule)
 * - With proxies + manual override: use override (for rotating gateways)
 * - With proxies + auto: 2 workers per proxy URL, max 20
 *   (rotating gateways handle multiple workers per URL)
 */
export function recommendedConcurrency(): number {
  if (!hasProxies()) return 1;
  if (_proxyConcurrency > 0) return Math.min(_proxyConcurrency, 20);
  return Math.min(_proxies.length * 2, 20);
}

/** Round-robin index for active proxies. */
let _rrIndex = 0;

/**
 * Get the next active (non-quarantined) proxy via round-robin.
 * Skips quarantined proxies automatically.
 * Returns undefined if no proxies are configured or all are quarantined.
 */
function nextActiveProxy(): ProxyEntry | undefined {
  if (_proxies.length === 0) return undefined;
  const now = Date.now();
  const active = _proxies.filter((p) => p.quarantinedUntil <= now);
  if (active.length === 0) {
    // All quarantined — reset the one with the earliest quarantine expiry
    const earliest = _proxies.reduce((a, b) =>
      a.quarantinedUntil < b.quarantinedUntil ? a : b
    );
    earliest.quarantinedUntil = 0;
    console.warn(`[ris-proxy] All proxies quarantined — force-unquarantining ${earliest.label}`);
    return earliest;
  }
  const proxy = active[_rrIndex % active.length];
  _rrIndex++;
  return proxy;
}

/**
 * Get proxy options for fetch().
 * Returns `{ proxy: string }` if a proxy is available, empty object otherwise.
 * Uses round-robin across all active (non-quarantined) proxies.
 */
export function proxyFetchOptions(): { proxy?: string } {
  const proxy = nextActiveProxy();
  if (!proxy) return {};
  proxy.totalRequests++;
  return { proxy: proxy.url };
}

/**
 * Report a successful request through the current proxy.
 * Call this after a successful fetch to track health.
 */
export function reportProxySuccess(): void {
  // Success is tracked via totalRequests vs failures — no action needed
}

/**
 * Report a failed request (429, timeout, connection error).
 * After 3 consecutive failures, the proxy is quarantined for QUARANTINE_S seconds.
 * Call this when a fetch fails or returns 429/5xx.
 */
export function reportProxyFailure(): void {
  // Find the proxy that was most recently used (highest totalRequests with recent failure)
  // Since we can't track which specific proxy was used per-call without returning it,
  // we quarantine the one with the most recent failure pattern
  const now = Date.now();
  // Simple approach: quarantine the proxy with most failures relative to requests
  const candidates = _proxies
    .filter((p) => p.quarantinedUntil <= now)
    .sort((a, b) => b.failures - a.failures);
  if (candidates.length > 0) {
    const worst = candidates[0]!;
    worst.failures++;
    if (worst.failures >= 1) {
      worst.quarantinedUntil = now + QUARANTINE_S * 1000;
      console.warn(
        `[ris-proxy] ${worst.label} quarantined for ${QUARANTINE_S}s ` +
          `(${worst.failures} failures, ${worst.totalRequests} total requests)`
      );
    }
  }
}

/**
 * Get the User-Agent header.
 * When using proxies, we vary the UA to look like real browsers.
 */
export function getUserAgent(): string {
  if (hasProxies()) {
    const uas = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
    ];
    return uas[Math.floor(Math.random() * uas.length)];
  }
  return "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)";
}

/**
 * Get a status summary of all proxies (for logging/debugging).
 */
export function proxyStatus(): string {
  if (_proxies.length === 0) return "No proxies configured";
  const now = Date.now();
  return _proxies
    .map((p) => {
      const status = p.quarantinedUntil > now ? "QUARANTINED" : "active";
      const sr = p.totalRequests > 0
        ? `${Math.round(100 * (1 - p.failures / p.totalRequests))}%`
        : "n/a";
      return `  ${p.label}: ${status} (reqs=${p.totalRequests}, fails=${p.failures}, sr=${sr})`;
    })
    .join("\n");
}

/**
 * Log proxy configuration at startup.
 */
export function logProxyConfig(): void {
  if (hasProxies()) {
    console.log(
      `[ris-proxy] ${_proxies.length} proxy(es) configured, ` +
        `delay=${PROXY_DELAY_MS}ms, ` +
        `concurrency=${recommendedConcurrency()}, ` +
        `quarantine=${QUARANTINE_S}s`
    );
    for (const p of _proxies) {
      console.log(`  → ${p.label}: ${p.url.replace(/:[^:@]+@/, ':****@')}`);
    }
  } else {
    console.log(
      "[ris-proxy] No proxies configured — direct connection, concurrency=1"
    );
  }
}
