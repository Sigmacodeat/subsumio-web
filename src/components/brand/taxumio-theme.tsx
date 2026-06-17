"use client";

// Applies the tax (Taxumio) brand palette site-wide when the request runs on
// a Taxumio host (taxum.io / taxumio.com). Sets the --brand-* CSS variables
// on :root so EVERY marketing page on that domain reads the emerald/green
// tax palette. No-op on the Sigmabrain platform host. The `?brand=` query
// override mirrors the chrome's detection for preview testing.

import { useEffect } from "react";
import { brandForHost } from "@/lib/brand";
import { themeForIndustry } from "@/lib/industry-pack";

export default function TaxumioTheme() {
  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("brand");
    const isTaxumio =
      override === "taxumio" ||
      (override !== "sigmabrain" && override !== "subsumio" && brandForHost(window.location.host) === "taxumio");
    if (!isTaxumio) return;

    const t = themeForIndustry("tax");
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
