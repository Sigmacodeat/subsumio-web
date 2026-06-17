"use client";

// Talentumio — executive search / recruiting brand. Thin wrapper.

import BrandedVerticalPage from "./branded-vertical-page";
import { RECRUITING } from "@/content/recruiting";
import type { Lang } from "@/content/site";

export default function RecruitingPage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={RECRUITING[lang]} signupIndustry="recruiting" />;
}
