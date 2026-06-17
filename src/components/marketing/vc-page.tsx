"use client";

// Investumio — VC / PE brand. Thin wrapper over BrandedVerticalPage.

import BrandedVerticalPage from "./branded-vertical-page";
import { VC } from "@/content/vc";
import type { Lang } from "@/content/site";

export default function VcPage({ lang }: { lang: Lang }) {
  return <BrandedVerticalPage lang={lang} content={VC[lang]} signupIndustry="vc" />;
}
