// Server-only Kanzlei-settings reads for auth routes. kanzlei-settings.ts's
// loadKanzleiSettings() goes through src/lib/api.ts, which is a browser fetch
// wrapper (cookies, redirect-on-401) — unusable from a route handler that
// runs BEFORE a session exists (login, signup, SSO callback). This talks to
// the engine directly with trusted server-side headers for a known brainId,
// the same pattern as cron jobs (engineHeadersForBrain).
import { ENGINE_URL, engineHeadersForBrain, firmBrainIdFor } from "@/lib/engine";
import { KANZLEI_SETTINGS_SLUG } from "@/lib/kanzlei-settings";
import type { User } from "@/lib/auth/store";
import { logger } from "@/lib/logger";

const log = logger("lib/kanzlei-settings-server");

/**
 * Outcome of reading the firm-wide 2FA requirement.
 *  - "required"     — the firm's settings page has require2FA === true
 *  - "not_required" — the settings page exists without it, or does not exist
 *                     at all (404: the firm never saved settings)
 *  - "unknown"      — the settings could not be read (engine unreachable,
 *                     timeout, 5xx/401/403, unreadable body, store error)
 */
export type TwoFactorPolicy = "required" | "not_required" | "unknown";

/**
 * Reads the Kanzlei-wide require2FA flag from a brain. Fail-CLOSED: a read
 * error is reported as "unknown", never silently as "not required" — the
 * caller decides how to refuse. Nothing is cached, so the next call
 * re-evaluates and a transient engine outage cannot outlive the outage.
 */
export async function readTwoFactorPolicy(brainId: string): Promise<TwoFactorPolicy> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`,
      {
        headers: engineHeadersForBrain(brainId),
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (res.status === 404) return "not_required";
    if (!res.ok) {
      log.warn(`[kanzlei-settings-server] 2FA policy read returned ${res.status}`);
      return "unknown";
    }
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> } | null;
    return page?.frontmatter?.require2FA === true ? "required" : "not_required";
  } catch (err) {
    log.warn(
      "[kanzlei-settings-server] 2FA policy read failed:",
      err instanceof Error ? err.message : String(err)
    );
    return "unknown";
  }
}

/**
 * The 2FA requirement that applies to this user: read from the FIRM's brain
 * (org.brainId) for a team member — the member's own user.brainId is their
 * unused personal workspace — or from their own brain when working alone.
 * A store error while resolving the firm is "unknown" as well.
 */
export async function twoFactorPolicyFor(
  user: Pick<User, "brainId" | "orgId">
): Promise<TwoFactorPolicy> {
  let brainId: string | null;
  try {
    brainId = await firmBrainIdFor(user);
  } catch (err) {
    log.warn(
      "[kanzlei-settings-server] firm lookup for 2FA policy failed:",
      err instanceof Error ? err.message : String(err)
    );
    return "unknown";
  }
  // Suspended firm: the login route refuses such accounts before this point
  // (isAccountBlocked); never report a policy for it.
  if (!brainId) return "unknown";
  return readTwoFactorPolicy(brainId);
}
