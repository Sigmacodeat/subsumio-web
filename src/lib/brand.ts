// Subsumio-only brand routing. This codebase serves only subsum.eu.

export type SiteBrand = "subsumio";

const DEFAULT_SUBSUMIO_HOSTS = [
  "subsum.eu",
  "www.subsum.eu",
  "subsum.io",
  "www.subsum.io",
  "subsumio.com",
  "www.subsumio.com",
];

/** Hosts that resolve to the Subsumio brand. Override with
 *  NEXT_PUBLIC_SUBSUMIO_HOSTS="subsum.eu,subsum.io,…" (comma-separated). */
export const SUBSUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_SUBSUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_SUBSUMIO_HOSTS;
  return list.map((h) => h.trim().toLowerCase()).filter(Boolean);
})();

/** Resolve the brand for a request host (port-stripped, case-insensitive). */
export function brandForHost(host: string | null | undefined): SiteBrand {
  if (!host) return "subsumio";
  const h = host.split(":")[0].trim().toLowerCase();
  if (SUBSUMIO_HOSTS.includes(h)) return "subsumio";
  return "subsumio";
}

/** Former vertical paths. On Subsumio-only builds they all fold home. */
export const OTHER_VERTICAL_PATHS: string[] = [];

/** Canonical public URL for the Subsumio product. */
export const SUBSUMIO_SITE_URL = process.env.NEXT_PUBLIC_SUBSUMIO_URL || "https://subsum.eu";

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** Canonical URL for the Subsumio page in a given language. */
export function subsumioCanonical(lang: "en" | "de"): string {
  if (isExternalUrl(SUBSUMIO_SITE_URL)) {
    const root = SUBSUMIO_SITE_URL.replace(/\/$/, "");
    return lang === "en" ? `${root}/en` : root;
  }
  return lang === "en" ? "/en" : "/";
}
