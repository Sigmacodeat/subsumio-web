// Features page — Server Component composer. Sections: animated
// knowledge-graph hero (client island) · one documented figure · how it works ·
// workflow demo · WhatsApp spotlight + full capability bento · the five areas
// in detail · security cross-link · FAQ · CTA.
// All hook-driven pieces live in ./features-interactive.tsx; the static
// sections render server-side inside serializable motion islands.

import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentFor, pBind, type Market } from "@/lib/market";
import { PROOF } from "@/content/proof-points";
import SubsumioShowcase from "./subsumio-showcase";
import { PageHero, SectionHeading, CTASection, Section } from "./primitives";
import { SECTION_PAD, SECTION_PAD_FLUSH, SECTION_COLUMN, H2_CTA_CLASS } from "./typography";
import { AnimatedFaqList } from "./animated-faq";
import {
  GraphHero,
  HowItWorks,
  FeatureCommandCenter,
  CategoryExplorer,
} from "./features-interactive";
import { AnimatedCounter, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

export default function FeaturesPage({ market = "at" }: { market?: Market }) {
  const { ui: UI_STRINGS, features: FEATURES_PAGE } = contentFor(market);
  const p = pBind(market);

  const t = FEATURES_PAGE;

  // One documented figure only — everything else was unsourced and removed.
  const stats = [
    {
      to: PROOF.recall8.numeric,
      dec: PROOF.recall8.decimals,
      prefix: "",
      suffix: " %",
      label: PROOF.recall8.label,
    },
  ];

  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      {/* Hero — copy left, animated graph right */}
      <PageHero
        badge={t.badge}
        h1a={t.h1a}
        h1b={t.h1b}
        sub={t.sub}
        accentVariant="gradient-premium"
        actions={
          <>
            <Button size="lg" variant="primary" asChild>
              <Link href={p("/signup")}>
                {t.ctaButton} <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={p("/superbrain")}>
                {UI_STRINGS.watchDemo} <ArrowRight size={16} />
              </Link>
            </Button>
          </>
        }
        visual={
          <div className="relative">
            <div className="brand-soft absolute inset-0 rounded-full blur-3xl" />
            <div className="glass relative rounded-3xl p-6 shadow-xl shadow-[hsl(222_40%_12%/0.10)]">
              <GraphHero />
              {/* -muted, not -subtle: on the glass panel the subtle tone only
                  reached 3.5:1, below the 4.5:1 a caption needs. */}
              <p className="mt-2 text-center font-mono text-sm [color:var(--mk-text-muted)]">
                {UI_STRINGS.featuresGraphCaption}
              </p>
            </div>
          </div>
        }
      />

      {/* Stats band */}
      <Section tone="light" className={SECTION_PAD_FLUSH}>
        <StaggerContainer className="mx-auto grid max-w-2xl grid-cols-1 gap-6" stagger={0.08}>
          {stats.map((s) => (
            <StaggerItem
              key={s.label}
              className="rounded-2xl border [border-color:var(--mk-border)] px-6 py-8 text-center [box-shadow:var(--mk-card-shadow)] [background:var(--mk-surface)]"
            >
              <div className="mb-2 [font-family:var(--font-display)] text-5xl leading-none font-normal tracking-[-0.025em] [color:var(--mk-text)] tabular-nums">
                {s.prefix ?? ""}
                <AnimatedCounter to={s.to} decimals={s.dec} suffix={s.suffix ?? ""} />
              </div>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                {s.label}
              </p>
              <Link
                href={p("/benchmark-methodology")}
                className="brand-text mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                So wurde gemessen <ArrowRight size={14} />
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </Section>

      {/* How it works — four sequential steps */}
      <HowItWorks />

      <FeatureCommandCenter />

      {/* On the Subsumio brand: the comprehensive law-firm feature set
            (WhatsApp assistant spotlight + the full capability bento). */}
      <SubsumioShowcase />

      <CategoryExplorer />

      {/* Security cross-link — replaces former Security & Teams category */}
      <Section tone="light" className={SECTION_PAD}>
        <Reveal variant="up" className={SECTION_COLUMN}>
          <div className="brand-border relative overflow-hidden rounded-3xl border px-6 py-12 text-center [box-shadow:var(--mk-card-shadow)] [background:var(--mk-surface)] md:px-12 md:py-16">
            <div className="relative mx-auto max-w-2xl">
              <div className="brand-soft brand-border mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl border">
                <Shield size={22} strokeWidth={1.75} className="brand-text" />
              </div>
              <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{UI_STRINGS.featuresSecurityTitle}</h2>
              <p className="mb-8 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
                {UI_STRINGS.featuresSecuritySub}
              </p>
              <Button size="lg" variant="secondary" asChild>
                <Link href={p("/security")}>
                  {UI_STRINGS.exploreSecurity} <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* FAQ */}
      <Section tone="light" className={`${SECTION_PAD} [background:var(--mk-surface)]`}>
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={t.faqTitle} />
          <AnimatedFaqList items={t.faq} tone="light" />
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={t.ctaTitle}
        sub={t.ctaSub}
        href={p("/signup")}
        label={t.ctaButton}
        secondaryHref={p("/contact")}
        secondaryLabel={UI_STRINGS.writeUs}
      />
    </div>
  );
}
