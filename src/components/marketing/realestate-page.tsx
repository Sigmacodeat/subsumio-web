"use client";

// Immumio — real estate / property brand. Thin wrapper over the shared
// BrandedVerticalPage template; all copy lives in content/realestate.ts.

import BrandedVerticalPage from "./branded-vertical-page";
import { REALESTATE } from "@/content/realestate";
import type { Lang } from "@/content/site";

export default function RealEstatePage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={REALESTATE[lang]} signupIndustry="realestate" />;
}
