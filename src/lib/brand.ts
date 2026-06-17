// Multi-brand host routing. ONE codebase serves the Sigmabrain platform site
// and the standalone product sites (subsum.io / taxum.io). The brand is
// resolved from the request host: middleware rewrites each product domain so
// its page becomes the homepage, and the marketing chrome renders a
// brand-scoped nav + "powered by Sigmabrain" footer.

export type SiteBrand = "sigmabrain" | "subsumio" | "taxumio";

const DEFAULT_SUBSUMIO_HOSTS = [
  "subsum.io",
  "www.subsum.io",
  "subsumio.com",
  "www.subsumio.com",
];

/** Hosts that resolve to the Subsumio brand. Override with
 *  NEXT_PUBLIC_SUBSUMIO_HOSTS="subsum.io,subsumio.com,…" (comma-separated). */
export const SUBSUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_SUBSUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_SUBSUMIO_HOSTS;
  return list.map((h) => h.trim().toLowerCase()).filter(Boolean);
})();

/** Other-vertical roots that should fold to Subsumio on a Subsumio host —
 *  the Subsumio domain presents Subsumio alone, never the whole platform. */
export const OTHER_VERTICAL_PATHS = [
  "/taxumio",
  "/vc",
  "/consulting",
  "/recruiting",
  "/insurance",
  "/realestate",
  "/compliance",
];

const DEFAULT_TAXUMIO_HOSTS = [
  "taxum.io",
  "www.taxum.io",
  "taxumio.com",
  "www.taxumio.com",
];

/** Hosts that resolve to the Taxumio brand. Override with
 *  NEXT_PUBLIC_TAXUMIO_HOSTS="taxum.io,taxumio.com,…" (comma-separated). */
export const TAXUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_TAXUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_TAXUMIO_HOSTS;
  return list.map((h) => h.trim().toLowerCase()).filter(Boolean);
})();

/** Resolve the brand for a request host (port-stripped, case-insensitive). */
export function brandForHost(host: string | null | undefined): SiteBrand {
  if (!host) return "sigmabrain";
  const h = host.split(":")[0].trim().toLowerCase();
  if (SUBSUMIO_HOSTS.includes(h)) return "subsumio";
  if (TAXUMIO_HOSTS.includes(h)) return "taxumio";
  return "sigmabrain";
}

/** Canonical public URL for the Subsumio product, used by the platform site's
 *  "Solutions → Subsumio" link. Defaults to the in-app path (always works); set
 *  NEXT_PUBLIC_SUBSUMIO_URL="https://subsum.io" once the domain is attached to
 *  the Vercel project so the platform links out to the standalone site. */
export const SUBSUMIO_SITE_URL = process.env.NEXT_PUBLIC_SUBSUMIO_URL || "/subsumio";

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** Canonical public URL for the Taxumio product. Defaults to the in-app path;
 *  set NEXT_PUBLIC_TAXUMIO_URL="https://taxum.io" once the domain is attached. */
export const TAXUMIO_SITE_URL = process.env.NEXT_PUBLIC_TAXUMIO_URL || "/taxumio";

/** Canonical URL for the Subsumio page in a given language. Consolidates SEO to
 *  the standalone Subsumio domain once NEXT_PUBLIC_SUBSUMIO_URL points there, so
 *  sigmabrain.com/subsumio and subsum.io/ don't compete as duplicate content.
 *  Falls back to the in-app path (resolved against metadataBase) otherwise. */
export function subsumioCanonical(lang: "en" | "de"): string {
  if (isExternalUrl(SUBSUMIO_SITE_URL)) {
    const root = SUBSUMIO_SITE_URL.replace(/\/$/, "");
    return lang === "de" ? `${root}/de` : root;
  }
  return lang === "de" ? "/de/subsumio" : "/subsumio";
}

/** Canonical URL for the Taxumio page in a given language. */
export function taxumioCanonical(lang: "en" | "de"): string {
  if (isExternalUrl(TAXUMIO_SITE_URL)) {
    const root = TAXUMIO_SITE_URL.replace(/\/$/, "");
    return lang === "de" ? `${root}/de` : root;
  }
  return lang === "de" ? "/de/taxumio" : "/taxumio";
}
