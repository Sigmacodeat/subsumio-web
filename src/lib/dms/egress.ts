/**
 * Outbound guard for DMS requests — the shared egress guard
 * (`@/lib/security/egress`) with DMS wording. A firm admin sets the DMS
 * address, and the server fetches from it.
 */
import {
  assertPublicUrl,
  EgressError,
  isBlockedAddress,
  safeFetch,
  setEgressHostResolver,
  type HostResolver,
} from "@/lib/security/egress";

export type { HostResolver };
export { isBlockedAddress };
export { EgressError as DmsEgressError };

const DMS_OPTS = {
  label: "DMS-Adresse",
  tooManyRedirectsMessage: "Zu viele Weiterleitungen vom DMS",
} as const;

/** Test seam: unit tests must not depend on real DNS (shared resolver). */
export function setDmsHostResolver(next: HostResolver | null): void {
  setEgressHostResolver(next);
}

/** Throws unless `rawUrl` is https and every address of its host is public. */
export function assertPublicDmsUrl(rawUrl: string): Promise<URL> {
  return assertPublicUrl(rawUrl, DMS_OPTS);
}

/** fetch() for DMS endpoints with every redirect hop re-checked. */
export function dmsSafeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  return safeFetch(rawUrl, init, DMS_OPTS);
}
