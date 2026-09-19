// Dedicated pricing page — agency-grade tiers + value props + FAQ.
// MotionConfig wraps the whole page; ScrollProgress shows reading position;
// every section scroll-reveals; value-props use signal-colored tiles.

import { Check, Shield, Clock, Globe, Coins, Zap } from "lucide-react";
import { PRICING_FAQ, VALUE_PROPS, UI_STRINGS, p } from "@/content/site";
import { CREDIT_PACKS, CREDIT_COSTS, type CreditOperation } from "@/lib/billing/credit-constants";
import { SectionHeading, CTASection, PageHero, Section } from "./primitives";
import { AnimatedFaqList } from "./animated-faq";
import { PricingGrid } from "./pricing-grid";
import { Reveal, StaggerContainer, StaggerItem, GlowCard } from "./motion-system";

// FACTS format: "1.499 €" / "79,8 Cent". The de-AT locale groups plain numbers
// with a no-break space ("1 499"), so plain numbers are formatted with de-DE
// rules, which yield the dot the rest of the site uses.
const fmt = (n: number, maxFraction = 0) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: maxFraction });

const OPERATION_LABELS: Record<CreditOperation, string> = {
  think: "Frage an die Akte",
  document_analysis: "Dokumentanalyse",
  subsumption: "Subsumtion",
  agent: "Mehrstufiger Auftrag an den Assistenten",
  deadline_detect: "Fristenerkennung",
  frist_engine: "Fristenrechner",
};

export default function PricingPage() {
  const faq = PRICING_FAQ.items;
  const faqTitle = PRICING_FAQ.title;
  const valueProps = VALUE_PROPS;
  const ui = UI_STRINGS;
  const trustSignals = [
    { icon: Shield, label: UI_STRINGS.trustedBy },
    { icon: Clock, label: UI_STRINGS.trialDaysFree },
    { icon: Globe, label: UI_STRINGS.euHosted },
  ];

  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      {/* Hero */}
      <PageHero
        badge={ui.transparentFair}
        h1a="Tarife für Kanzleien. Ein klarer Leistungsumfang."
        sub="Solo, Kanzlei und Enterprise — Aktenarbeit, geteiltes Kanzleiwissen und Betrieb nach Ihren Vorgaben."
        icon="Check"
      />

      {/* Pricing Grid */}
      <Section tone="light" className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal variant="up">
            <PricingGrid />
          </Reveal>
        </div>
      </Section>

      {/* KI-Guthaben — consumption-based pricing for AI features */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal variant="up">
            <SectionHeading
              title="KI-Guthaben – zahlen Sie nach Verbrauch"
              sub="Jeder KI-Vorgang kostet eine feste Anzahl Credits. Pakete kaufen Sie zusätzlich zu Ihrem Tarif."
            />
          </Reveal>

          {/* Credit packs */}
          <StaggerContainer
            className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
            stagger={0.08}
          >
            {CREDIT_PACKS.map((pack) => (
              <StaggerItem key={pack.id}>
                <GlowCard className="flex h-full flex-col rounded-2xl border [border-color:var(--mk-border)] p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] motion-reduce:transition-none">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border [border-color:var(--ds-success-border)] [background:var(--ds-success-bg)]">
                      <Coins size={18} className="[color:var(--ds-success-text)]" />
                    </div>
                    {pack.savingsPct >= 5 && (
                      <span className="rounded-full bg-[color:var(--ds-success-bg)] px-2 py-0.5 text-xs font-semibold [color:var(--ds-success-text)]">
                        −{pack.savingsPct} %
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold [color:var(--mk-text)]">{pack.name}</h3>
                  <p className="mt-1 text-3xl font-bold [color:var(--mk-text)]">
                    {fmt(pack.credits)}{" "}
                    <span className="text-sm font-normal [color:var(--mk-text-muted)]">
                      Credits
                    </span>
                  </p>
                  <p className="mt-2 text-sm [color:var(--mk-text-muted)]">
                    {fmt(pack.priceEur)} € einmalig
                  </p>
                  <p className="mt-1 text-xs [color:var(--mk-text-muted)]">
                    {`${fmt((pack.priceEur / pack.credits) * 100, 1)} Cent pro Credit`}
                  </p>
                </GlowCard>
              </StaggerItem>
            ))}
          </StaggerContainer>

          {/* Credit costs per operation */}
          <Reveal variant="up" className="mt-10">
            <div className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
              <div className="mb-4 flex items-center gap-2">
                <Zap size={16} className="brand-text" />
                <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                  Credits pro KI-Vorgang
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.entries(CREDIT_COSTS) as [CreditOperation, number][]).map(([op, cost]) => {
                  return (
                    <div
                      key={op}
                      className="flex items-center justify-between rounded-lg border [border-color:var(--mk-border)] px-3 py-2"
                    >
                      <span className="text-xs [color:var(--mk-text-muted)]">
                        {OPERATION_LABELS[op]}
                      </span>
                      <span className="text-sm font-semibold [color:var(--mk-text)]">
                        {cost === 0 ? "gratis" : `${cost}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs [color:var(--mk-text-muted)]">
                Credits werden erst nach einem erfolgreichen KI-Vorgang abgezogen. Fehlgeschlagene
                Anfragen werden nicht berechnet. Das automatische Aufladen stellen Sie unter Plan
                &amp; Abrechnung ein.
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Trust signals */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-3" stagger={0.06}>
            {trustSignals.map((sig) => {
              const Icon = sig.icon;
              return (
                <StaggerItem key={sig.label}>
                  <GlowCard className="flex h-full flex-col items-center justify-center rounded-2xl border [border-color:var(--mk-border)] p-5 text-center transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] motion-reduce:transition-none">
                    <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                      <Icon size={22} className="brand-text" />
                    </div>
                    <h3 className="text-sm leading-tight font-semibold [color:var(--mk-text)]">
                      {sig.label}
                    </h3>
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
                className="rounded-2xl transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none"
              >
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-[background-color,border-color,color] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)] motion-reduce:transition-none">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border [border-color:var(--ds-success-border)] transition-transform duration-[var(--ds-duration-normal)] [background:var(--ds-success-bg)] hover:scale-110">
                    <Check size={18} className="[color:var(--ds-success-text)]" />
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
        sub="30 Tage testen, keine Kreditkarte."
        href={p("/signup?plan=pro")}
        label="Solo starten"
        secondaryHref={p("/contact")}
        secondaryLabel={ui.writeUs}
        showLogo={false}
      />
    </div>
  );
}
