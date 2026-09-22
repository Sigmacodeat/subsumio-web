import type { MetadataRoute } from "next";
import { getAllPosts } from "@/content/blog";
import { getAllCitySlugs } from "@/content/city-pages";
import { getAllCitySlugsDe } from "@/content/city-pages-de";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io";

// Public marketing routes per market. Every entry is served canonically
// under /at or /de — the root variants 308 to the /at URLs. Austria-only
// pages (blog, docs handbook — Austrian-law content) have no /de twin.
const PAGES = [
  "",
  "/superbrain",
  "/features",
  "/pricing",
  "/security",
  "/partners",
  "/download",
  "/whatsapp",
  "/about",
  "/contact",
  "/solutions/law-firms",
  "/solutions/solo",
  "/solutions/in-house",
  "/benchmark-methodology",
];
const AT_ONLY_PAGES = ["/docs", "/blog"];

function langAlts(path: string): Record<string, string> {
  return {
    "de-AT": `${BASE}/at${path}`,
    "de-DE": `${BASE}/de${path}`,
    "x-default": `${BASE}/at${path}`,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of PAGES) {
    for (const market of ["at", "de"] as const) {
      const path = `/${market}${page}`;
      entries.push({
        url: `${BASE}${path}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: page === "" ? 1 : 0.7,
        alternates: { languages: langAlts(page) },
      });
    }
  }
  for (const page of AT_ONLY_PAGES) {
    const url = `${BASE}/at${page}`;
    entries.push({
      url,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: { languages: { "de-AT": url, "x-default": url } },
    });
  }

  // Public live demo — standalone URL (not under /at), the conversion entry.
  entries.push({
    url: `${BASE}/demo`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.9,
    alternates: {
      languages: {
        "de-AT": `${BASE}/demo`,
        "de-DE": `${BASE}/demo`,
        "x-default": `${BASE}/demo`,
      },
    },
  });

  // Legal pages — canonical in both markets (auth pages remain noindex).
  for (const page of ["/privacy", "/imprint", "/terms", "/dpa"]) {
    for (const market of ["at", "de"] as const) {
      const url = `${BASE}/${market}${page}`;
      entries.push({
        url,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.3,
        alternates: { languages: langAlts(page) },
      });
    }
  }

  // Blog posts — Austrian-law content, AT market only.
  for (const post of getAllPosts()) {
    const url = `${BASE}/at/blog/${post.slug}`;
    entries.push({
      url,
      lastModified: new Date(post.date),
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: { languages: { "de-AT": url, "x-default": url } },
    });
  }

  // City landing pages per market.
  for (const [market, slugs] of [
    ["at", getAllCitySlugs()],
    ["de", getAllCitySlugsDe()],
  ] as const) {
    entries.push({
      url: `${BASE}/${market}/cities`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: { languages: langAlts("/cities") },
    });
    for (const slug of slugs) {
      const url = `${BASE}/${market}/cities/${slug}`;
      entries.push({
        url,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.6,
        alternates:
          market === "at"
            ? { languages: { "de-AT": url, "x-default": url } }
            : { languages: { "de-DE": url, "x-default": url } },
      });
    }
  }

  return entries;
}
