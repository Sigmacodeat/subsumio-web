"use client";

// Applies the brand palette site-wide based on the request host.
//   - Subsumio hosts (subsum.eu / subsum.io) → legal navy palette
//   - Taxumio hosts (taxum.io / taxumio.com) → tax emerald palette
// Sets the --brand-* CSS variables on :root so EVERY marketing page on
// that domain reads the correct palette. The `?brand=` query override
// mirrors the chrome's detection for preview testing.

import { useEffect } from "react";
import { brandForHost, industryForBrand } from "@/lib/brand";
import { themeForIndustry } from "@/lib/industry-pack";

export default function SubsumioTheme() {
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("brand");
    const brand =
      override === "taxumio" || override === "subsumio"
        ? override
        : brandForHost(window.location.host);
    const industry = industryForBrand(brand);

    const t = themeForIndustry(industry);
    const s = document.documentElement.style;
    s.setProperty("--brand-primary", t.primary);
    s.setProperty("--brand-primary-hover", t.primaryHover);
    s.setProperty("--brand-secondary", t.secondary);
    s.setProperty("--brand-tertiary", t.tertiary);
    s.setProperty("--brand-glow", t.glow);
    s.setProperty("--brand-gradient-from", t.gradientFrom);
    s.setProperty("--brand-gradient-via", t.gradientVia);
    s.setProperty("--brand-gradient-to", t.gradientTo);
  }, []);

  return null;
}
