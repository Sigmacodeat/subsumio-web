"use client";

import { ArrowRight, CheckCircle2, Gavel, Scale, TrendingUp } from "lucide-react";
import {
  Section,
  SectionHeading,
  PageHero,
  CTASection,
  ContentCard,
  IconTile,
  FaqList,
  TrustStrip,
  BreadcrumbNav,
  ICONS,
  H3_CLASS,
} from "./chrome";
import { Reveal, GlowCard } from "./motion-system";
import { Button } from "@/components/ui/button";
import { QuickAnalysisWidget } from "./quick-analysis-widget";
import type { NichePageContent } from "@/content/niche-pages";

export function NicheLandingPage({ content }: { content: NichePageContent }) {
  const ctaLabel = "Kostenlosen Fallcheck starten";
  const nicheKeyword = `${content.h1a.replace(/[—–-]$/, "").trim()} ${content.h1b.replace(/[—–-]$/, "").trim()}`.trim();

  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip" lang="de">
      {/* Breadcrumbs */}
      <div className="mx-auto max-w-7xl px-6 pt-6">
        <BreadcrumbNav
          items={[
            { label: "Start", href: "/" },
            { label: "Rechtsbereiche", href: "/#rechtsbereiche" },
            { label: content.h1a },
          ]}
        />
      </div>

      {/* 1. Hero */}
      <PageHero
        badge={content.badge}
        h1a={content.h1a}
        h1b={content.h1b}
        sub={content.heroSub}
        tone="light"
        accentVariant="gradient"
        icon={Scale}
        actions={
          <div className="flex flex-wrap gap-3">
            <a href="#quick-check">
              <Button size="lg" variant="primary" className="group min-h-[48px]">
                {ctaLabel}
                <ArrowRight className="ml-2 size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </a>
            <a href="#preise">
              <Button size="lg" variant="outline" className="min-h-[48px]">
                Preise ansehen
              </Button>
            </a>
          </div>
        }
      />

      {/* 1b. Intro Paragraph — SEO Content Depth */}
      <Section tone="light" className="py-16 md:py-20" aria-label="Einleitung">
        <div className="mx-auto max-w-4xl px-6">
          <Reveal>
            <p className="text-lg leading-relaxed [color:var(--mk-text-muted)]">
              {content.intro}
            </p>
          </Reveal>
        </div>
      </Section>

      {/* 2. Pain Points */}
      <Section tone="light" className="py-20 md:py-28" aria-label="Häufige Probleme">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            badge="Das Problem"
            title={`${nicheKeyword} — typische Herausforderungen`}
            sub="Verstehen Sie, wo die häufigsten Stolpersteine liegen — und wie die AI-gestützte Fallanalyse hilft."
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {content.pains.map((pain, i) => {
              const Icon = ICONS[pain.icon] ?? ICONS.AlertTriangle;
              return (
                <Reveal key={pain.title} delay={i * 0.08}>
                  <ContentCard icon={Icon} title={pain.title} desc={pain.desc} />
                </Reveal>
              );
            })}
          </div>
        </div>
      </Section>

      {/* 3. Solution — 3-step process */}
      <Section tone="slate" className="py-20 md:py-28" aria-label="So funktioniert die AI-Fallanalyse">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            badge="Die Lösung"
            title={`${nicheKeyword} — AI-Analyse in 3 Schritten`}
            sub="Von der Fallbeschreibung zum anwalt fertigen Dossier — in 5 Minuten statt Wochen."
          />
          <div className="grid gap-8 md:grid-cols-3">
            {content.solutionSteps.map((step, i) => (
              <Reveal key={step.step} delay={i * 0.12}>
                <div className="relative h-full rounded-2xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)]">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="brand-bg brand-text flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold">
                      {step.step}
                    </div>
                    <div className="h-px flex-1 [background:var(--mk-border)]" />
                  </div>
                  <h3 className={`mb-3 ${H3_CLASS}`}>{step.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* 4. Legal Rulings */}
      <Section tone="light" className="py-20 md:py-28" aria-label="Aktuelle Rechtsprechung">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            badge="Rechtslage"
            title={`${nicheKeyword} — Urteile & Rechtsprechung`}
            sub="Die juristische Grundlage für Ihren Fall — aktuelle Entscheidungen von OGH, BGH und EuGH."
          />
          <div className="mx-auto max-w-4xl space-y-4">
            {content.legalRulings.map((ruling, i) => (
              <Reveal key={ruling.ref} delay={i * 0.08}>
                <GlowCard className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                    <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                      <IconTile icon={Gavel} size={20} />
                      <div>
                        <p className="text-sm font-semibold [color:var(--mk-text)]">{ruling.court}</p>
                        <p className="text-xs [color:var(--mk-text-subtle)]">{ruling.date}</p>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="mb-1 font-mono text-sm font-semibold brand-text">{ruling.ref}</p>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{ruling.summary}</p>
                    </div>
                  </div>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* 5. Case Example */}
      <Section tone="slate" className="py-20 md:py-28" aria-label="Fall-Beispiel">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            badge="Fall-Beispiel"
            title={`${nicheKeyword} — Fallbeispiel aus der Praxis`}
            sub="So sieht ein typischer Fall aus — und wie die AI-gestützte Analyse zum Ergebnis führt."
          />
          <Reveal>
            <div className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)] md:p-10">
              <div className="mb-6 flex items-center gap-3">
                <IconTile icon={TrendingUp} size={22} />
                <h3 className={H3_CLASS}>{content.caseExample.title}</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm font-semibold [color:var(--mk-text)]">Sachverhalt</p>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{content.caseExample.facts}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold [color:var(--mk-text)]">Ergebnis</p>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{content.caseExample.outcome}</p>
                </div>
                <div className="flex items-center gap-2 border-t [border-color:var(--mk-border)] pt-4">
                  <span className="text-sm [color:var(--mk-text-subtle)]">Streitwert / Ergebnis:</span>
                  <span className="brand-text text-lg font-bold">{content.caseExample.value}</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 6. Quick Analysis Widget + Pricing (mid-page) */}
      <Section tone="light" className="py-20 md:py-24" aria-label="Kostenloser AI-Check">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-start gap-8 lg:grid-cols-2">
            {/* Left: Widget */}
            <Reveal>
              <QuickAnalysisWidget
                nicheSlug={content.slug}
                nicheTitle={`${content.h1a} ${content.h1b}`}
                pricingTiers={content.pricingTiers}
              />
            </Reveal>

            {/* Right: Pricing Tiers */}
            <Reveal delay={0.12}>
              <div id="preise" className="space-y-4 scroll-mt-20">
                <div className="mb-2">
                  <p className="mb-1 text-sm font-semibold uppercase tracking-wider brand-text">
                    Transparente Preise
                  </p>
                  <h2 className="text-2xl font-bold tracking-tight [color:var(--mk-text)] md:text-3xl">
                    Vom kostenlosen Check zum Anwalt-Paket
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    Keine versteckten Kosten. Keine Vorkosten. Sie zahlen nur, wenn Sie mehr möchten.
                  </p>
                </div>
                <div className="space-y-3">
                  {content.pricingTiers.map((tier) => (
                    <div
                      key={tier.name}
                      className={`relative rounded-2xl border p-5 transition ${
                        tier.highlighted
                          ? "border-brand-500 bg-white shadow-md"
                          : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                      }`}
                    >
                      {tier.highlighted && (
                        <span className="absolute -top-2.5 right-4 rounded-full brand-bg px-2.5 py-0.5 text-[10px] font-bold text-white">
                          BELIEBTEST
                        </span>
                      )}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-1 flex items-baseline gap-2">
                            <h3 className="text-base font-bold [color:var(--mk-text)]">{tier.name}</h3>
                            <span className="text-lg font-bold brand-text">{tier.price}</span>
                          </div>
                          <p className="mb-3 text-xs [color:var(--mk-text-subtle)]">{tier.priceNote}</p>
                          <ul className="space-y-1.5">
                            {tier.features.map((f, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs [color:var(--mk-text-muted)]">
                                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-500" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <a href="#quick-check" className="mt-4 block">
                        <Button
                          size="sm"
                          variant={tier.highlighted ? "primary" : "outline"}
                          className="w-full"
                        >
                          {tier.cta}
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
                <p className="text-center text-xs [color:var(--mk-text-subtle)]">
                  Alle Preise inkl. MwSt. · DSGVO-konform · EU-gehostet
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* 7. FAQ */}
      <Section tone="light" className="py-20 md:py-28" aria-label="Häufige Fragen">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeading
            badge="FAQ"
            title={`${nicheKeyword} — häufige Fragen`}
            sub="Antworten auf die wichtigsten Fragen — direkt und verständlich."
          />
          <FaqList items={content.faq} />
        </div>
      </Section>

      {/* 8. Trust Elements */}
      <Section tone="slate" className="py-16" aria-label="Trust & Sicherheit">
        <div className="mx-auto max-w-7xl px-6">
          <Reveal>
            <div className="text-center">
              <p className="mb-6 text-sm font-semibold uppercase tracking-wider [color:var(--mk-text-subtle)]">
                Sicherheit & Vertrauen
              </p>
              <TrustStrip
                items={content.trustItems.map((item) => ({
                  label: item.label,
                  icon: ICONS[item.icon] ?? ICONS.ShieldCheck,
                }))}
              />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* 9. Related Niches — Internal Linking */}
      {content.relatedNiches.length > 0 && (
        <Section tone="light" className="py-20 md:py-24" aria-label="Verwandte Rechtsbereiche">
          <div className="mx-auto max-w-7xl px-6">
            <SectionHeading
              badge="Mehr Rechtsbereiche"
              title="Verwandte Rechtsbereiche"
              sub="Passende AI-Fallanalysen für angrenzende Rechtsthemen — kostenlos und in 5 Minuten."
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {content.relatedNiches.map((niche, i) => (
                <Reveal key={niche.slug} delay={i * 0.08}>
                  <a
                    href={`/nischen/${niche.slug}`}
                    className="group flex h-full items-center justify-between rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-xl"
                  >
                    <div className="flex-1">
                      <h3 className={`mb-1 ${H3_CLASS}`}>{niche.title}</h3>
                      <p className="text-xs [color:var(--mk-text-subtle)]">Kostenloser AI-Check →</p>
                    </div>
                    <ArrowRight
                      size={20}
                      className="ml-4 shrink-0 text-[color:var(--mk-text-subtle)] transition-transform group-hover:translate-x-1 group-hover:brand-text"
                    />
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* 10. Final CTA */}
      <CTASection
        title={content.ctaTitle}
        sub={content.ctaSub}
        href="#quick-check"
        label={ctaLabel}
        secondaryHref="/solutions/law-firms"
        secondaryLabel="Für Anwälte"
        tone="dark"
      />
    </div>
  );
}
