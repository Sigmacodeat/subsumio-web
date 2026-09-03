/**
 * v0.42.38.0+ — Provider Credits Pre-Flight Check.
 *
 * Called before pipeline runs to detect depleted provider credits
 * BEFORE the pipeline fails mid-flight (wasting partial work).
 *
 * Pings each configured provider with a minimal request (max_tokens=1)
 * and returns a clear error if any are depleted.
 *
 * Cached for 60s to avoid burning provider quota on every pipeline start.
 */

export interface ProviderHealth {
  status: "ok" | "depleted" | "error" | "not_configured";
  latencyMs: number | null;
  error?: string;
}

export interface CreditsHealthResult {
  providers: Record<string, ProviderHealth>;
  allOk: boolean;
  checkedAt: string;
}

const CACHE_TTL_MS = 60_000;
let _cachedResult: { timestamp: number; data: CreditsHealthResult } | null = null;

const PROVIDER_TOPUP_URLS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/billing",
  openrouter: "https://openrouter.ai/settings/credits",
};

// v0.42.38.0+ — Retry wrapper: network blips (DNS, TCP reset, transient 5xx)
// should not produce false "error" status. Retry up to 2 times with 500ms backoff.
// Only retry on network errors / 5xx — never on 4xx (those are definitive).
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pingWithRetry(fn: () => Promise<ProviderHealth>): Promise<ProviderHealth> {
  let lastResult: ProviderHealth | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await fn();
    // Definitive results — no retry
    if (
      result.status === "ok" ||
      result.status === "depleted" ||
      result.status === "not_configured"
    ) {
      return result;
    }
    // 401 is definitive (bad key) — no retry
    if (result.error === "Invalid API key") return result;
    // Transient error — retry
    lastResult = result;
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return lastResult ?? { status: "error", latencyMs: null, error: "Unknown" };
}

async function pingAnthropic(apiKey: string): Promise<ProviderHealth> {
  return pingWithRetry(async () => {
    const start = Date.now();
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) return { status: "ok", latencyMs };
      const body = await res.text();
      if (body.includes("credit balance is too low") || body.includes("billing")) {
        return { status: "depleted", latencyMs, error: "Credit balance too low" };
      }
      if (res.status === 401) return { status: "error", latencyMs, error: "Invalid API key" };
      if (res.status === 429)
        return { status: "ok", latencyMs, error: "Rate limited (credits OK)" };
      // 5xx = transient → retryable
      return { status: "error", latencyMs, error: `HTTP ${res.status}` };
    } catch (err) {
      const latencyMs = Date.now() - start;
      if (err instanceof Error && err.name === "TimeoutError") {
        return { status: "error", latencyMs, error: "Timeout (10s)" };
      }
      // Network error → retryable
      return {
        status: "error",
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

async function pingOpenRouter(apiKey: string): Promise<ProviderHealth> {
  return pingWithRetry(async () => {
    const start = Date.now();
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-haiku-4-5",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) return { status: "ok", latencyMs };
      const body = await res.text();
      if (res.status === 402 || body.includes("Insufficient credits")) {
        return { status: "depleted", latencyMs, error: "Insufficient credits" };
      }
      if (res.status === 401) return { status: "error", latencyMs, error: "Invalid API key" };
      if (res.status === 429)
        return { status: "ok", latencyMs, error: "Rate limited (credits OK)" };
      return { status: "error", latencyMs, error: `HTTP ${res.status}` };
    } catch (err) {
      const latencyMs = Date.now() - start;
      if (err instanceof Error && err.name === "TimeoutError") {
        return { status: "error", latencyMs, error: "Timeout (10s)" };
      }
      return {
        status: "error",
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

async function checkAllProviders(): Promise<CreditsHealthResult> {
  const providers: Record<string, ProviderHealth> = {};
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY_FALLBACK;

  const checks: Array<[string, Promise<ProviderHealth>]> = [];
  if (anthropicKey) {
    checks.push(["anthropic", pingAnthropic(anthropicKey)]);
  } else {
    providers.anthropic = { status: "not_configured", latencyMs: null };
  }
  if (openrouterKey) {
    checks.push(["openrouter", pingOpenRouter(openrouterKey)]);
  } else {
    providers.openrouter = { status: "not_configured", latencyMs: null };
  }

  const results = await Promise.allSettled(checks.map(([_, p]) => p));
  for (let i = 0; i < checks.length; i++) {
    const [name] = checks[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      providers[name] = result.value;
    } else {
      providers[name] = {
        status: "error",
        latencyMs: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  }

  const allOk = Object.values(providers).every(
    (p) => p.status === "ok" || p.status === "not_configured"
  );

  return { providers, allOk, checkedAt: new Date().toISOString() };
}

/**
 * Get cached or fresh credits health. Returns 60s-cached result when available.
 */
export async function getCreditsHealth(): Promise<CreditsHealthResult> {
  if (_cachedResult && Date.now() - _cachedResult.timestamp < CACHE_TTL_MS) {
    return _cachedResult.data;
  }
  const data = await checkAllProviders();
  _cachedResult = { timestamp: Date.now(), data };
  return data;
}

/**
 * Pre-flight check for pipeline runs. Throws a clear, actionable error
 * if any configured provider is depleted or erroring.
 *
 * @param requiredProviders — which providers the pipeline needs (default: any configured)
 * @throws Error with actionable message if credits are depleted
 */
export async function assertProviderCredits(requiredProviders?: string[]): Promise<void> {
  const health = await getCreditsHealth();

  if (health.allOk) return;

  // If specific providers required, only check those
  const toCheck = requiredProviders
    ? Object.entries(health.providers).filter(([name]) => requiredProviders.includes(name))
    : Object.entries(health.providers);

  const issues: string[] = [];
  for (const [name, p] of toCheck) {
    if (p.status === "depleted" || p.status === "error") {
      const topupUrl = PROVIDER_TOPUP_URLS[name];
      const topupHint = topupUrl ? ` — Aufladen: ${topupUrl}` : "";
      issues.push(`${name}: ${p.status} (${p.error ?? "unknown"})${topupHint}`);
    }
  }

  if (issues.length > 0) {
    // Fire alert webhook/email (best-effort, non-blocking)
    sendCreditsAlert(health).catch(() => {
      // best-effort — ignore errors
    });

    throw new Error(
      `Provider-Credits Pre-Flight Check fehlgeschlagen:\n${issues.join("\n")}\n\n` +
        `Pipeline-Run abgebrochen um Mid-Flight-Fehler zu vermeiden. ` +
        `Bitte Credits aufladen und erneut versuchen.`
    );
  }
}

// ── Alert System ──────────────────────────────────────────────────────

const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between alerts per provider
let _lastAlertSent: Map<string, number> = new Map();

/**
 * Send alert when provider credits are depleted. Best-effort, non-blocking.
 * Throttled to 1 alert per provider per hour to avoid spam.
 *
 * Channels:
 *   1. Console error (always — visible in server logs)
 *   2. Email to ADMIN_EMAIL (if RESEND_API_KEY + ADMIN_EMAIL configured)
 *   3. Webhook to CREDITS_ALERT_WEBHOOK_URL (if configured)
 */
async function sendCreditsAlert(health: CreditsHealthResult): Promise<void> {
  const now = Date.now();
  const issues: Array<[string, ProviderHealth]> = Object.entries(health.providers).filter(
    ([, p]) => p.status === "depleted" || p.status === "error"
  );

  for (const [name, p] of issues) {
    // Throttle: skip if alert sent for this provider < 1h ago
    const lastSent = _lastAlertSent.get(name);
    if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) continue;

    _lastAlertSent.set(name, now);

    const topupUrl = PROVIDER_TOPUP_URLS[name];
    const message = `Provider "${name}" ist ${p.status === "depleted" ? "leer" : "fehlerhaft"}: ${p.error ?? "unknown"}`;
    const topupHint = topupUrl ? `Aufladen: ${topupUrl}` : "";

    // 1. Console error (always)
    console.error(`[CREDITS ALERT] ${message}${topupHint ? " — " + topupHint : ""}`);

    // 2. Email to admin (if configured)
    const adminEmail = process.env.ADMIN_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;
    if (adminEmail && resendKey) {
      try {
        const from = process.env.MAIL_FROM || "Subsumio <hello@subsum.io>";
        const subject = `[ALERT] Provider "${name}" Credits ${p.status === "depleted" ? "leer" : "Fehler"}`;
        const text = `${message}\n\n${topupHint}\n\nGeprüft am: ${health.checkedAt}\n\nPipeline-Runs werden fehlschlagen bis Credits aufgeladen sind.\n\nSubsumio System`;
        const html = `<p><strong>${message}</strong></p><p>${topupHint ? `<a href="${topupUrl}">${topupHint}</a><br><br>` : ""}Geprüft am: ${health.checkedAt}</p><p><em>Pipeline-Runs werden fehlschlagen bis Credits aufgeladen sind.</em></p>`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: adminEmail, subject, text, html }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // best-effort
      }
    }

    // 3. Webhook (if configured)
    const webhookUrl = process.env.CREDITS_ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "provider_credits_depleted",
            provider: name,
            status: p.status,
            error: p.error,
            topupUrl,
            checkedAt: health.checkedAt,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // best-effort
      }
    }
  }
}

// ── Test Helpers (exported for unit tests, not for production use) ─────

export const __test = {
  /** Reset the in-memory cache + alert throttle (for test isolation) */
  resetCache(): void {
    _cachedResult = null;
    _lastAlertSent = new Map();
  },
  /** Inject a cached result to test assertProviderCredits without real API calls */
  injectCachedResult(data: CreditsHealthResult): void {
    _cachedResult = { timestamp: Date.now(), data };
  },
  /** Directly call sendCreditsAlert (for testing alert logic) */
  sendCreditsAlert,
  /** Expose pingWithRetry for unit testing retry logic */
  pingWithRetry,
  /** Expose internal ping functions for testing with mocked fetch */
  pingAnthropic,
  pingOpenRouter,
  /** Expose RETRY_DELAY_MS so tests can mock setTimeout if needed */
  MAX_RETRIES,
  RETRY_DELAY_MS,
  ALERT_COOLDOWN_MS,
  /** Get last alert sent timestamp for a provider (for throttle testing) */
  getLastAlertSent(provider: string): number | undefined {
    return _lastAlertSent.get(provider);
  },
  /** Set last alert sent (for throttle testing) */
  setLastAlertSent(provider: string, timestamp: number): void {
    _lastAlertSent.set(provider, timestamp);
  },
};
