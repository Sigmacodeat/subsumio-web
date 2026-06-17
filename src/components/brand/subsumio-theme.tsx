"use client";

// Applies the legal (Subsumio) brand palette site-wide.
// Sets the --brand-* CSS variables on :root for all marketing pages.

import { useEffect } from "react";
import { themeForIndustry } from "@/lib/industry-pack";

export default function SubsumioTheme() {
  useEffect(() => {
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
