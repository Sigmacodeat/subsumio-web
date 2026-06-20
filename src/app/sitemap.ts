import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

// Every public marketing route, EN + DE, with hreflang alternates.
const PAGES = [
  "",
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

  // Auth + legal — bilingual, include DE variants
  for (const page of ["/login", "/signup", "/privacy", "/imprint", "/terms"]) {
    entries.push({
      url: `${BASE}${page}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    });
    entries.push({
      url: `${BASE}/de${page}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    });
  }

  return entries;
}
