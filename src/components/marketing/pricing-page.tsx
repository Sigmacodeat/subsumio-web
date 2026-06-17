"use client";

// Dedicated pricing page — tiers + pricing-specific FAQ.

import { LANDING, PRICING, type Lang } from "@/content/site";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
} from "./chrome";
import { PricingGrid } from "./pricing-grid";
import { Reveal } from "./motion-system";

export default function PricingPage({ lang }: { lang: Lang }) {
  const pricing = PRICING[lang];
  // Reuse the landing FAQ — limits/data/open-source questions are pricing questions.
  const faq = LANDING[lang].faq;

  return (
    <div className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
      <MarketingBackground />
      <MarketingNav lang={lang} />

      <section className="relative z-10 pt-20 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal variant="up">
            <SectionHeading badge="Pricing" title={pricing.title} sub={pricing.sub} />
          </Reveal>
          <PricingGrid lang={lang} />
        </div>
      </section>

      <section className="relative z-10 py-24 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
        <div className="max-w-5xl mx-auto">
          <Reveal variant="up">
            <SectionHeading title={LANDING[lang].faqTitle} />
          </Reveal>
          <FaqList items={faq} />
        </div>
      </section>

      <MarketingFooter lang={lang} />
    </div>
  );
}
