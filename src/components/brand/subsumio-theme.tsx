"use client";

// Applies the legal (Subsumio) brand palette site-wide when the request runs on
// a Subsumio host (subsum.eu / subsum.io). Sets the --brand-* CSS variables
// on :root so EVERY marketing page on that domain reads the legal navy palette,
// not just /subsumio. No-op on the Subsumio platform host. The `?brand=`
// query override mirrors the chrome's detection for preview testing.

import { useEffect } from "react";
import { brandForHost } from "@/lib/brand";
import { themeForIndustry } from "@/lib/industry-pack";

export default function SubsumioTheme() {
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("brand");
    const isSubsumio =
      override === "subsumio" ||
      (override !== "subsumio" && brandForHost(window.location.host) === "subsumio");
    if (!isSubsumio) return;

    const t = themeForIndustry("legal");
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
