// Subsumio-only brand routing. This codebase serves only subsum.io.

export type SiteBrand = "subsumio";

const DEFAULT_SUBSUMIO_HOSTS = [
  "subsum.io",
  "www.subsum.io",
  "subsumio.com",
  "www.subsumio.com",
];

/** Hosts that resolve to the Subsumio brand. */
export const SUBSUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_SUBSUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_SUBSUMIO_HOSTS;
  return list.map((h) => h.trim().toLowerCase()).filter(Boolean);
})();

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/** Canonical public URL for the Subsumio product. */
export const SUBSUMIO_SITE_URL = process.env.NEXT_PUBLIC_SUBSUMIO_URL || "/subsumio";

/** Canonical URL for the Subsumio page in a given language. */
export function subsumioCanonical(lang: "en" | "de"): string {
  if (isExternalUrl(SUBSUMIO_SITE_URL)) {
    const root = SUBSUMIO_SITE_URL.replace(/\/$/, "");
    return lang === "de" ? `${root}/de` : root;
  }
  return lang === "de" ? "/de/subsumio" : "/subsumio";
}
