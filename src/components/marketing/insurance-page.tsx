"use client";

// Versumio — insurance broker / agency brand. Thin wrapper over the shared
// BrandedVerticalPage template; all copy lives in content/insurance.ts.

import BrandedVerticalPage from "./branded-vertical-page";
import { INSURANCE } from "@/content/insurance";
import type { Lang } from "@/content/site";

export default function InsurancePage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={INSURANCE[lang]} signupIndustry="insurance" />;
}
