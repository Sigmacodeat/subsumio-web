"use client";

// Consultumio — consulting / agency brand. Thin wrapper over BrandedVerticalPage.

import BrandedVerticalPage from "./branded-vertical-page";
import { CONSULTING } from "@/content/consulting";
import type { Lang } from "@/content/site";

export default function ConsultingPage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={CONSULTING[lang]} signupIndustry="consulting" />;
}
