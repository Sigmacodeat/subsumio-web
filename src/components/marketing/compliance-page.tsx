"use client";

// Compliumio — compliance / GRC brand. Thin wrapper over the shared
// BrandedVerticalPage template; all copy lives in content/compliance.ts.

import BrandedVerticalPage from "./branded-vertical-page";
import { COMPLIANCE } from "@/content/compliance";
import type { Lang } from "@/content/site";

export default function CompliancePage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={COMPLIANCE[lang]} signupIndustry="compliance" />;
}
