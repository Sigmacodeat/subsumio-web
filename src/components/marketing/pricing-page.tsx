"use client";

// Dedicated pricing page — agency-grade tiers + value props + FAQ.
// MotionConfig wraps the whole page; ScrollProgress shows reading position;
// every section scroll-reveals; value-props use signal-colored tiles.

import { Check, Shield, Clock, Globe, CreditCard } from "lucide-react";
import { PRICING, PRICING_FAQ, VALUE_PROPS, UI_STRINGS, p, type Lang } from "@/content/site";
import { SectionHeading, CTASection, PageHero, Section } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { PricingGrid } from "./pricing-grid";
import { Reveal, StaggerContainer, StaggerItem, GlowCard } from "./motion-system";

export default function PricingPage({ lang }: { lang: Lang }) {
  const pricing = PRICING[lang];
  const faq = PRICING_FAQ[lang].items;
  const faqTitle = PRICING_FAQ[lang].title;
  const valueProps = VALUE_PROPS[lang];
  const ui = UI_STRINGS[lang];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <PageHero badge={ui.transparentFair} h1a={pricing.title} sub={pricing.sub} icon={Check} />

      {/* Pricing Grid */}
      <Section tone="light" className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal variant="up">
            <PricingGrid lang={lang} />
          </Reveal>
        </div>
      </Section>

      {/* Trust signals */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <StaggerContainer className="grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.06}>
            {[
              { icon: Shield, label: UI_STRINGS[lang].trustedBy },
              { icon: Clock, label: UI_STRINGS[lang].trialDaysFree },
              { icon: Globe, label: UI_STRINGS[lang].euHosted },
              { icon: CreditCard, label: UI_STRINGS[lang].noGamesTitle },
            ].map((sig) => {
              const Icon = sig.icon;
              return (
                <StaggerItem key={sig.label}>
                  <GlowCard className="flex h-full flex-col items-center justify-center rounded-2xl border [border-color:var(--mk-border)] p-5 text-center transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)]">
                    <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                      <Icon size={22} className="brand-text" />
                    </div>
                    <h3 className="text-sm font-semibold leading-tight [color:var(--mk-text)]">{sig.label}</h3>
                  </GlowCard>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      {/* Value props — signal-colored tiles */}
      <Section tone="light" className="px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={ui.noGamesTitle} sub={ui.noGamesSub} />
          </Reveal>
          <StaggerContainer className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4" stagger={0.08}>
            {valueProps.map((prop) => (
              <StaggerItem
                key={prop.title}
                className="rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border [border-color:var(--signal-green-border)] transition-transform duration-300 [background:var(--signal-green-bg)] hover:scale-110">
                    <Check size={18} className="[color:var(--signal-green)]" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                    {prop.title}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {prop.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading title={faqTitle} />
          </Reveal>
          <AnimatedFaqList items={faq} tone="light" />
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={ui.stillQuestions}
        sub={ui.writeUs}
        href={p(lang, "/signup")}
        label={ui.startFree}
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={ui.writeUs}
        showLogo={false}
      />
    </div>
  );
}
