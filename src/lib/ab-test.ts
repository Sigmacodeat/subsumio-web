"use client";

import { useEffect, useState } from "react";

const VARIANT_KEY = "subsumio-hero-variant";
const VARIANTS = ["A", "B"] as const;
export type HeroVariant = (typeof VARIANTS)[number];

export function useHeroVariant(): HeroVariant {
  const [variant, setVariant] = useState<HeroVariant>("A");

  useEffect(() => {
    const stored = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${VARIANT_KEY}=`))
      ?.split("=")[1] as HeroVariant | undefined;

    if (stored && VARIANTS.includes(stored)) {
      setVariant(stored);
    } else {
      const assigned: HeroVariant = Math.random() < 0.5 ? "A" : "B";
      document.cookie = `${VARIANT_KEY}=${assigned}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      setVariant(assigned);
    }
  }, []);

  return variant;
}

export const HERO_VARIANTS: Record<
  HeroVariant,
  { de: { h1a: string; h1b: string }; en: { h1a: string; h1b: string } }
> = {
  A: {
    de: { h1a: "Jede Akte,", h1b: "eine belegte Antwort." },
    en: { h1a: "Every matter,", h1b: "one cited answer." },
  },
  B: {
    de: {
      h1a: "KI-Kanzleisoftware:",
      h1b: "Akten, Fristen, belegte Antworten.",
    },
    en: {
      h1a: "AI legal software:",
      h1b: "matters, deadlines, cited answers.",
    },
  },
};
