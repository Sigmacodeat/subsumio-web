import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://subsum.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // App areas and the firm-specific public forms (those also carry
        // noindex) — not Subsumio marketing content.
        disallow: [
          "/dashboard",
          "/admin",
          "/ops",
          "/mobile",
          "/portal",
          "/api/",
          "/erstanfrage",
          "/termin",
          "/mandat",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
