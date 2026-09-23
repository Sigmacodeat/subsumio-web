/**
 * Provider failover: when a call to a Claude model on Anthropic's own API
 * fails for a reason that is about the ACCOUNT or AVAILABILITY — no credit,
 * key rejected, rate limit, overload, 5xx, network — the same model is tried
 * once more through OpenRouter. On 2026-09-19 an empty Anthropic balance took
 * every AI feature down although an OpenRouter key was configured.
 *
 * Never fails over on a malformed request (4xx other than the account/limit
 * codes): the same request would fail the same way at the second provider.
 *
 * Off switch: GBRAIN_PROVIDER_FAILOVER=off. Active only when OPENROUTER_API_KEY
 * is set. Under SUBSUMIO_EU_ONLY=1 a failover target that is not EU-resident
 * (OpenRouter without EU attestation) is never chosen: the original error
 * surfaces instead of a silent reroute out of the EU.
 */

import { isAllowedUnderEuPolicy } from "./eu-policy.ts";

/** Same model on OpenRouter; null when there is no counterpart. */
export function openRouterEquivalent(modelStr: string): string | null {
  const m = /^anthropic:(claude-[a-z]+-[0-9][0-9-]*)$/.exec(modelStr.trim());
  if (!m) return null;
  const id = m[1]
    .replace(/-\d{8}$/, "") // dated snapshot: claude-haiku-4-5-20251001
    .replace(/-(\d+)-(\d+)$/, "-$1.$2"); // claude-haiku-4-5 → claude-haiku-4.5
  return `openrouter:anthropic/${id}`;
}

const ACCOUNT_OR_AVAILABILITY_STATUS = new Set([401, 402, 403, 408, 409, 429, 529]);
const ACCOUNT_OR_AVAILABILITY_TEXT =
  /credit balance|billing|insufficient (?:funds|credits)|quota|overloaded|rate.?limit|too many requests|service unavailable|bad gateway|gateway timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network/i;

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; cause?: unknown } | null;
  const s = e?.status ?? e?.statusCode;
  if (typeof s === "number") return s;
  return e?.cause && e.cause !== err ? statusOf(e.cause) : undefined;
}

function messagesOf(err: unknown, depth = 0): string {
  if (!err || depth > 3) return "";
  const e = err as { message?: unknown; cause?: unknown };
  const own = typeof e.message === "string" ? e.message : String(err);
  return `${own} ${messagesOf(e.cause, depth + 1)}`;
}

/** True when the failure is about the provider account or its availability, not the request. */
export function isProviderFailure(err: unknown): boolean {
  if ((err as { name?: string } | null)?.name === "AbortError") return false; // our own cancel
  const status = statusOf(err);
  if (status !== undefined) {
    if (status >= 500 || ACCOUNT_OR_AVAILABILITY_STATUS.has(status)) return true;
    // Anthropic answers an empty balance with 400 invalid_request_error.
    return status === 400 && /credit balance|billing/i.test(messagesOf(err));
  }
  return ACCOUNT_OR_AVAILABILITY_TEXT.test(messagesOf(err));
}

export function isFailoverEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env.GBRAIN_PROVIDER_FAILOVER ?? "").toLowerCase() === "off") return false;
  return Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim());
}

/** The model to retry with, or null when this failure must surface as is. */
export function providerFailoverModel(
  modelStr: string,
  err: unknown,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  if (!isFailoverEnabled(env)) return null;
  if ((err as { name?: string } | null)?.name === "EuResidencyError") return null;
  if (!isProviderFailure(err)) return null;
  const alternate = openRouterEquivalent(modelStr);
  if (alternate && !isAllowedUnderEuPolicy(alternate, env)) return null;
  return alternate;
}
