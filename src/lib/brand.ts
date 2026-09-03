// Multi-product brand routing. This codebase serves two products:
//   - Subsumio (legal) on subsum.eu / subsum.io / subsumio.com
//   - Taxumio  (tax)    on taxum.io / taxumio.com
// Both share the same platform core (auth, engine, dashboard) but present
// distinct marketing surfaces, branding, and SEO.

import type { Lang } from "@/content/site";

export type SiteBrand = "subsumio" | "taxumio";

const DEFAULT_SUBSUMIO_HOSTS = [
  "subsum.eu",
  "www.subsum.eu",
  "subsum.io",
  "www.subsum.io",
  "subsumio.com",
  "www.subsumio.com",
];

const DEFAULT_TAXUMIO_HOSTS = ["taxum.io", "www.taxum.io", "taxumio.com", "www.taxumio.com"];

/** Hosts that resolve to the Subsumio (legal) brand. Override with
 *  NEXT_PUBLIC_SUBSUMIO_HOSTS="subsum.eu,subsum.io,…" (comma-separated). */
export const SUBSUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_SUBSUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_SUBSUMIO_HOSTS;
  return list.map((h) => h.trim().toLowerCase()).filter(Boolean);
})();

/** Hosts that resolve to the Taxumio (tax) brand. Override with
 *  NEXT_PUBLIC_TAXUMIO_HOSTS="taxum.io,taxumio.com,…" (comma-separated). */
export const TAXUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_TAXUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_TAXUMIO_HOSTS;
  return list.map((h) => h.trim().toLowerCase()).filter(Boolean);
})();

/** All known product hosts (for middleware matching). */
export const ALL_PRODUCT_HOSTS: string[] = [...SUBSUMIO_HOSTS, ...TAXUMIO_HOSTS];

/** Resolve the brand for a request host (port-stripped, case-insensitive).
 *  Unknown hosts default to Subsumio (the primary product). */
export function brandForHost(host: string | null | undefined): SiteBrand {
  if (!host) return "subsumio";
  const h = host.split(":")[0].trim().toLowerCase();
  if (TAXUMIO_HOSTS.includes(h)) return "taxumio";
  return "subsumio";
}

/** Former vertical paths. On multi-product builds they fold to the
 *  respective product landing page. */
export const OTHER_VERTICAL_PATHS: string[] = [];

/** Canonical public URL for the Subsumio (legal) product. */
export const SUBSUMIO_SITE_URL = process.env.NEXT_PUBLIC_SUBSUMIO_URL || "https://subsum.eu";

/** Canonical public URL for the Taxumio (tax) product.
 *  Defaults to the internal route "/taxumio" until the domain is live. */
export const TAXUMIO_SITE_URL = process.env.NEXT_PUBLIC_TAXUMIO_URL || "/taxumio";

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** Canonical URL for the Subsumio (legal) page in a given language. */
export function subsumioCanonical(lang: Lang): string {
  if (isExternalUrl(SUBSUMIO_SITE_URL)) {
    const root = SUBSUMIO_SITE_URL.replace(/\/$/, "");
    return lang === "en" ? `${root}/en` : root;
  }
  return lang === "en" ? "/en" : "/";
}

/** Canonical URL for the Taxumio (tax) page in a given language. */
export function taxumioCanonical(lang: Lang): string {
  if (isExternalUrl(TAXUMIO_SITE_URL)) {
    const root = TAXUMIO_SITE_URL.replace(/\/$/, "");
    return lang === "en" ? `${root}/en` : root;
  }
  return lang === "en" ? "/en/taxumio" : "/taxumio";
}

/** Map a brand to its industry key. */
export function industryForBrand(brand: SiteBrand): string {
  return brand === "taxumio" ? "tax" : "legal";
}

/** Map a brand to its marketing root path (relative). */
export function marketingPathForBrand(brand: SiteBrand): string {
  return brand === "taxumio" ? "/taxumio" : "/";
}
