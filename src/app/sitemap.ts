import type { MetadataRoute } from "next";
import { getAllPosts } from "@/content/blog";
import { getAllCitySlugs } from "@/content/city-pages";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.eu";

// Public marketing routes for the Austria-only pilot. Every entry is served
// canonically under /at — the root variants 308 to these URLs.
const PAGES = [
  "",
  "/superbrain",
  "/features",
  "/pricing",
  "/security",
  "/partners",
  "/download",
  "/docs",
  "/whatsapp",
  "/about",
  "/contact",
  "/solutions/law-firms",
  "/solutions/solo",
  "/solutions/in-house",
  "/benchmark-methodology",
  "/blog",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const page of PAGES) {
    const path = `/at${page}`;
    entries.push({
      url: `${BASE}${path}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: page === "" ? 1 : 0.7,
      alternates: { languages: { "de-AT": `${BASE}${path}`, "x-default": `${BASE}${path}` } },
    });
  }

  // Legal pages — Austrian canonical only (auth pages remain noindex).
  for (const page of ["/privacy", "/imprint", "/terms"]) {
    const url = `${BASE}/at${page}`;
    entries.push({
      url,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
      alternates: { languages: { "de-AT": url, "x-default": url } },
    });
  }

  // Blog posts — individual entries with post dates as lastModified
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

  // Austrian city landing pages only.
  entries.push({
    url: `${BASE}/at/cities`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
    alternates: {
      languages: { "de-AT": `${BASE}/at/cities`, "x-default": `${BASE}/at/cities` },
    },
  });
  for (const slug of getAllCitySlugs()) {
    const url = `${BASE}/at/cities/${slug}`;
    entries.push({
      url,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
      alternates: { languages: { "de-AT": url, "x-default": url } },
    });
  }

  return entries;
}
