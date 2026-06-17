"use client";

// Taxumio — tax & accounting firm brand. Thin wrapper over the shared
// BrandedVerticalPage template; all copy lives in content/taxumio.ts.

import BrandedVerticalPage from "./branded-vertical-page";
import { TAXUMIO } from "@/content/taxumio";
import type { Lang } from "@/content/site";

export default function TaxumioPage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={TAXUMIO[lang]} signupIndustry="tax" />;
}
