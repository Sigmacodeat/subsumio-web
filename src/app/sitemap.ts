import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

// Every public marketing route, EN + DE + AT + CH, with hreflang alternates.
const PAGES = [
  "",
  "/de",
  "/features",
  "/pricing",
  "/security",
  "/partners",
  "/download",
  "/docs",
  "/subsumio",
  "/whatsapp",
  "/about",
  "/contact",
  "/solutions/law-firms",
  "/solutions/solo",
  "/solutions/in-house",
  "/solutions/mid-sized",
  "/benchmark-methodology",
  "/blog",
  "/cities",
  "/cities/wien",
  "/cities/berlin",
  "/cities/zuerich",
];

// hreflang locale codes for each route prefix
const LOCALES = [
  { lang: "de-DE", prefix: "" },
  { lang: "de-AT", prefix: "/at" },
  { lang: "de-CH", prefix: "/ch" },
  { lang: "en", prefix: "/en" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of PAGES) {
    // /de is the DE landing page — only one URL, no locale prefix variants
    if (page === "/de") {
      const deAlternates: Record<string, string> = {};
      for (const loc of LOCALES) {
        deAlternates[loc.lang] = loc.lang === "de-DE" ? `${BASE}/` : `${BASE}${loc.prefix}`;
      }
      entries.push({
        url: `${BASE}/de`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages: deAlternates },
      });
      continue;
    }

    const base = page === "" ? "/" : page;

    // Build hreflang alternates for all locales
    const alternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      alternates[loc.lang] = `${BASE}${loc.prefix}${base === "/" ? "" : base}`;
    }

    // Create an entry for each locale
    for (const loc of LOCALES) {
      const url = `${BASE}${loc.prefix}${base === "/" ? "" : base}`;
      entries.push({
        url,
        lastModified: now,
        changeFrequency: "weekly",
        priority: page === "" && loc.lang === "de-DE" ? 1 : page === "" ? 0.9 : 0.7,
        alternates: { languages: alternates },
      });
    }
  }

  // Legal pages — bilingual, include DE variants (auth pages excluded: noindex)
  for (const page of ["/privacy", "/imprint", "/terms"]) {
    const legalAlternates: Record<string, string> = {};
    for (const loc of LOCALES) {
      legalAlternates[loc.lang] = `${BASE}${loc.prefix}${page}`;
    }
    for (const loc of LOCALES) {
      entries.push({
        url: `${BASE}${loc.prefix}${page}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.3,
        alternates: { languages: legalAlternates },
      });
    }
  }

  return entries;
}
