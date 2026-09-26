/**
 * RIS request helpers shared by the corpus scripts.
 *
 * RIS is always called directly from our own address, with our announced
 * User-Agent. Routing requests through rotating proxies to multiply the
 * per-address limits is not supported: `proxyFetchOptions()` always returns
 * no proxy and `recommendedConcurrency()` is always 1, whatever the
 * environment says. Pacing and coordination live in ris-pace.ts / ris-lock.ts.
 */

import { RIS_USER_AGENT } from "./ris-pace";

/** Extra fetch() options for RIS requests — always none (direct connection). */
export function proxyFetchOptions(): Record<string, never> {
  return {};
}

/** In-process concurrency for RIS requests — always one connection. */
export function recommendedConcurrency(): number {
  return 1;
}

/** The one RIS User-Agent (see ris-pace.ts) — never a browser disguise. */
export function getUserAgent(): string {
  return RIS_USER_AGENT;
}
