"use client";

// Applies the canonical Subsumio palette site-wide.

import { useEffect } from "react";
import { SUBSUMIO_THEME } from "@/lib/industry-pack";

export default function SubsumioTheme() {
  useEffect(() => {
    const t = SUBSUMIO_THEME;
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
