// Server-only Kanzlei-settings reads for auth routes. kanzlei-settings.ts's
// loadKanzleiSettings() goes through src/lib/api.ts, which is a browser fetch
// wrapper (cookies, redirect-on-401) — unusable from a route handler that
// runs BEFORE a session exists (login, signup, SSO callback). This talks to
// the engine directly with trusted server-side headers for a known brainId,
// the same pattern as cron jobs (engineHeadersForBrain).
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { KANZLEI_SETTINGS_SLUG } from "@/lib/kanzlei-settings";
import { logger } from "@/lib/logger";

const log = logger("lib/kanzlei-settings-server");

/**
 * Does this Kanzlei require 2FA org-wide? Fail-OPEN on any read error
 * (unreachable engine, missing settings page, malformed frontmatter) —
 * consistent with every other optional-policy read in this codebase. This
 * is a login-time convenience flag (must2fa on the session), not the only
 * enforcement point; it degrades to "not required" rather than locking
 * everyone out if the engine is down.
 */
export async function orgRequires2FA(brainId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`,
      {
        headers: engineHeadersForBrain(brainId),
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (!res.ok) return false;
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    return page.frontmatter?.require2FA === true;
  } catch (err) {
    log.warn(
      "[kanzlei-settings-server] orgRequires2FA read failed, failing open:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}
