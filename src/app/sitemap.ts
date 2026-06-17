import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io";

// Subsumio-only marketing routes, EN + DE.
const PAGES = [
  "",
  "/features",
  "/pricing",
  "/compare",
  "/security",
  "/partners",
  "/download",
  "/docs",
  "/subsumio",
  "/subsumio/produkt",
  "/subsumio/sicherheit",
  "/subsumio/whatsapp",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of PAGES) {
    const en = `${BASE}${page === "" ? "/" : page}`;
    const de = `${BASE}/de${page}`;
    entries.push({
      url: en,
      lastModified: now,
      changeFrequency: "weekly",
      priority: page === "" ? 1 : 0.8,
      alternates: { languages: { en, de } },
    });
    entries.push({
      url: de,
      lastModified: now,
      changeFrequency: "weekly",
      priority: page === "" ? 0.9 : 0.7,
      alternates: { languages: { en, de } },
    });
  }

  // Legal pages
  for (const page of ["/privacy", "/imprint", "/terms"]) {
    entries.push({ url: `${BASE}${page}`, lastModified: now, changeFrequency: "monthly", priority: 0.3 });
  }

  return entries;
}
