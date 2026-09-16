// Subsumio is the only active product. Former Taxumio hosts are retained only
// as legacy redirect inputs so old bookmarks do not resolve to missing pages.

import type { Lang } from "@/content/site";

const DEFAULT_SUBSUMIO_HOSTS = [
  "subsum.eu",
  "www.subsum.eu",
  "subsum.io",
  "www.subsum.io",
  "subsumio.com",
  "www.subsumio.com",
];

export const LEGACY_TAXUMIO_HOSTS = [
  "taxum.io",
  "www.taxum.io",
  "taxumio.com",
  "www.taxumio.com",
] as const;

export const SUBSUMIO_HOSTS: string[] = (() => {
  const raw = process.env.NEXT_PUBLIC_SUBSUMIO_HOSTS;
  const list = raw ? raw.split(",") : DEFAULT_SUBSUMIO_HOSTS;
  return list.map((host) => host.trim().toLowerCase()).filter(Boolean);
})();

export const SUBSUMIO_SITE_URL = process.env.NEXT_PUBLIC_SUBSUMIO_URL || "https://subsum.eu";

export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

export function subsumioCanonical(_lang: Lang): string {
  if (isExternalUrl(SUBSUMIO_SITE_URL)) {
    const root = SUBSUMIO_SITE_URL.replace(/\/$/, "");
    return `${root}/at`;
  }
  return "/at";
}
