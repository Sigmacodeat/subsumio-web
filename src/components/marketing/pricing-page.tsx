"use client";

// Dedicated pricing page — agency-grade tiers + value props + FAQ.
// MotionConfig wraps the whole page; ScrollProgress shows reading position;
// every section scroll-reveals; value-props use signal-colored tiles.

import { Check, Shield, Clock, Globe, CreditCard, Coins, Zap } from "lucide-react";
import { useState } from "react";
import { professionalPricing, privateOffers, type Audience } from "@/content/audiences";
import { PRICING_FAQ, VALUE_PROPS, UI_STRINGS, p, type Lang } from "@/content/site";
import { CREDIT_PACKS, CREDIT_COSTS, type CreditOperation } from "@/lib/billing/credit-constants";
import { SectionHeading, CTASection, PageHero, Section } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { PricingGrid } from "./pricing-grid";
import { PrivatePricingGrid } from "./private-pricing-grid";
import { AudienceSwitcher } from "./audience-switcher";
import { Reveal, StaggerContainer, StaggerItem, GlowCard } from "./motion-system";

export default function PricingPage({ lang }: { lang: Lang }) {
  const en = !["de", "at", "ch"].includes(lang);
  const [audience, setAudience] = useState<Audience>("professional");
  const pricing = audience === "professional" ? professionalPricing(lang) : privateOffers(lang);
  const privateFaq = en
    ? [
        {
          q: "Is private access legal advice?",
          a: "No. It provides automated legal information and a first orientation. It does not replace individual advice from a qualified lawyer.",
        },
        {
          q: "Which firm functions are excluded?",
          a: "Private access has no bulk ingestion, employee roles, shared firm knowledge, DATEV workflows or WhatsApp secretary.",
        },
        {
          q: "Can I buy Case Check or Private Plus now?",
          a: "Not yet. Paid private offers remain request-only until consumer checkout, withdrawal information and server-side entitlements are production-ready.",
        },
        {
          q: "What should I do with urgent deadlines?",
          a: "Contact a qualified lawyer immediately. Do not rely on an automated result for urgent or complex proceedings.",
        },
      ]
    : [
        {
          q: "Ist der Privatzugang Rechtsberatung?",
          a: "Nein. Er liefert automatisierte rechtliche Informationen und eine erste Orientierung. Er ersetzt keine individuelle Beratung durch eine qualifizierte Rechtsanwältin oder einen qualifizierten Rechtsanwalt.",
        },
        {
          q: "Welche Kanzleifunktionen sind ausgeschlossen?",
          a: "Der Privatzugang enthält keinen Massen-Ingest, keine Mitarbeiterrollen, kein geteiltes Kanzleiwissen, keine DATEV-Workflows und kein WhatsApp-Sekretariat.",
        },
        {
          q: "Kann ich Fallcheck oder Privat Plus schon kaufen?",
          a: "Noch nicht. Bezahlte Privatangebote bleiben anfragebasiert, bis Verbraucher-Checkout, Widerrufsinformationen und serverseitige Berechtigungen produktionsreif sind.",
        },
        {
          q: "Was mache ich bei dringenden Fristen?",
          a: "Wende dich sofort an eine qualifizierte Kanzlei. Verlasse dich bei dringenden oder komplexen Verfahren nicht auf ein automatisiertes Ergebnis.",
        },
      ];
  const faq = audience === "professional" ? PRICING_FAQ[lang].items : privateFaq;
  const faqTitle =
    audience === "professional"
      ? PRICING_FAQ[lang].title
      : en
        ? "Questions about private access"
        : "Fragen zum Privatzugang";
  const valueProps =
    audience === "professional"
      ? VALUE_PROPS[lang]
      : en
        ? [
            {
              title: "Clear scope",
              desc: "Every offer states its document, case and feature limits before you start.",
            },
            {
              title: "Source-backed",
              desc: "Results point back to the passages used for the automated orientation.",
            },
            {
              title: "No firm features",
              desc: "Private data does not become shared firm memory or an employee workspace.",
            },
            {
              title: "Paid access not yet live",
              desc: "Case Check and Private Plus remain request-only until consumer checkout is ready.",
            },
          ]
        : [
            {
              title: "Klarer Umfang",
              desc: "Dokument-, Fall- und Funktionslimits stehen vor dem Start fest.",
            },
            {
              title: "Mit Fundstellen",
              desc: "Ergebnisse führen zu den verwendeten Passagen der automatisierten Orientierung zurück.",
            },
            {
              title: "Keine Kanzleifunktionen",
              desc: "Private Daten werden nicht zu geteiltem Kanzleiwissen oder einem Mitarbeiter-Workspace.",
            },
            {
              title: "Bezahlzugang noch nicht live",
              desc: "Fallcheck und Privat Plus bleiben anfragebasiert, bis der Verbraucher-Checkout fertig ist.",
            },
          ];
  const ui = UI_STRINGS[lang];
  const trustSignals =
    audience === "professional"
      ? [
          { icon: Shield, label: UI_STRINGS[lang].trustedBy },
          { icon: Clock, label: UI_STRINGS[lang].trialDaysFree },
          { icon: Globe, label: UI_STRINGS[lang].euHosted },
          { icon: CreditCard, label: UI_STRINGS[lang].noGamesTitle },
        ]
      : [
          { icon: Shield, label: en ? "Clearly limited scope" : "Klar begrenzter Umfang" },
          { icon: Clock, label: en ? "Quick Check free" : "Schnellcheck kostenlos" },
          { icon: Globe, label: UI_STRINGS[lang].euHosted },
          {
            icon: CreditCard,
            label: en ? "No automatic paid checkout" : "Kein automatischer Bezahlabschluss",
          },
        ];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <PageHero
        badge={ui.transparentFair}
        h1a={
          en ? "Two access paths. One clear scope." : "Zwei Zugänge. Ein klarer Leistungsumfang."
        }
        sub={
          en
            ? "Choose private orientation or professional matter and firm workflows."
            : "Wähle private Orientierung oder professionelle Akten- und Kanzlei-Workflows."
        }
        icon={Check}
      />

      {/* Pricing Grid */}
      <Section tone="light" className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal variant="up">
            <div
              className="mb-10 flex justify-center"
              role="tablist"
              aria-label={en ? "Pricing audience" : "Preise nach Zielgruppe"}
            >
              <div className="inline-flex rounded-xl border [border-color:var(--mk-border)] p-1 [background:var(--mk-surface)]">
                {(["private", "professional"] as Audience[]).map((id) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={audience === id}
                    onClick={() => setAudience(id)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${audience === id ? "brand-bg text-white" : "[color:var(--mk-text-muted)] hover:[background:var(--mk-hover)]"}`}
                  >
                    {id === "private"
                      ? en
                        ? "Individuals"
                        : "Privatpersonen"
                      : en
                        ? "Legal professionals"
                        : "Kanzleien & Rechtsabteilungen"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-9 text-center">
              <h2 className="text-3xl font-bold [color:var(--mk-text)]">{pricing.title}</h2>
              <p className="mx-auto mt-3 max-w-3xl [color:var(--mk-text-muted)]">{pricing.sub}</p>
            </div>
            {audience === "professional" ? (
              <PricingGrid lang={lang} />
            ) : (
              <PrivatePricingGrid lang={lang} />
            )}
            <div className="mt-12">
              <AudienceSwitcher lang={lang} active={audience} compact />
            </div>
          </Reveal>
        </div>
      </Section>

      {/* Credit Packs — consumption-based pricing for AI features */}
      {audience === "professional" && (
        <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <Reveal variant="up">
              <SectionHeading
                title={en ? "AI Credits — pay as you go" : "AI-Credits — zahle nach Verbrauch"}
                sub={
                  en
                    ? "Every AI operation costs a fixed number of credits. Buy packs on top of your plan — no surprise bills."
                    : "Jede AI-Operation kostet eine feste Anzahl Credits. Kaufe Packs zusätzlich zu deinem Plan — keine Überraschungsrechnungen."
                }
              />
            </Reveal>

            {/* Credit packs */}
            <StaggerContainer
              className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
              stagger={0.08}
            >
              {CREDIT_PACKS.map((pack) => (
                <StaggerItem key={pack.id}>
                  <GlowCard className="flex h-full flex-col rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)]">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border [border-color:var(--signal-green-border)] [background:var(--signal-green-bg)]">
                        <Coins size={18} className="[color:var(--signal-green)]" />
                      </div>
                      {pack.savingsPct > 0 && (
                        <span className="rounded-full bg-[color:var(--signal-green-bg)] px-2 py-0.5 text-xs font-semibold [color:var(--signal-green)]">
                          -{pack.savingsPct}%
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold [color:var(--mk-text)]">{pack.name}</h3>
                    <p className="mt-1 text-3xl font-bold [color:var(--mk-text)]">
                      {pack.credits}
                      <span className="ml-1 text-sm font-normal [color:var(--mk-text-muted)]">
                        {en ? "credits" : "Credits"}
                      </span>
                    </p>
                    <p className="mt-2 text-sm [color:var(--mk-text-muted)]">
                      {pack.priceEur} € {en ? "one-time" : "einmalig"}
                    </p>
                    <p className="mt-1 text-xs [color:var(--mk-text-muted)]">
                      {en
                        ? `${((pack.priceEur / pack.credits) * 100).toFixed(1)} ct per credit`
                        : `${((pack.priceEur / pack.credits) * 100).toFixed(1)} ct pro Credit`}
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
                    {en ? "Cost per AI operation" : "Kosten pro AI-Operation"}
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(Object.entries(CREDIT_COSTS) as [CreditOperation, number][]).map(
                    ([op, cost]) => {
                      const opLabels: Record<CreditOperation, string> = {
                        think: en ? "Think (Q&A)" : "Think (Q&A)",
                        document_analysis: en ? "Document Analysis" : "Dokument-Analyse",
                        subsumption: en ? "Subsumption" : "Subsumption",
                        agent: en ? "Agent Run" : "Agent-Run",
                        deadline_detect: en ? "Deadline Detection" : "Fristen-Erkennung",
                        frist_engine: en ? "Frist Engine" : "Frist-Engine",
                      };
                      return (
                        <div
                          key={op}
                          className="flex items-center justify-between rounded-lg border [border-color:var(--mk-border)] px-3 py-2"
                        >
                          <span className="text-xs [color:var(--mk-text-muted)]">
                            {opLabels[op]}
                          </span>
                          <span className="text-sm font-semibold [color:var(--mk-text)]">
                            {cost === 0 ? (en ? "free" : "gratis") : `${cost}`}
                          </span>
                        </div>
                      );
                    }
                  )}
                </div>
                <p className="mt-4 text-xs [color:var(--mk-text-muted)]">
                  {en
                    ? "Credits are deducted after a successful AI operation. Failed requests are not charged. Auto-reload available in dashboard settings."
                    : "Credits werden nach erfolgreicher AI-Operation abgezogen. Fehlgeschlagene Anfragen werden nicht berechnet. Auto-Reload in den Dashboard-Einstellungen verfügbar."}
                </p>
              </div>
            </Reveal>
          </div>
        </Section>
      )}

      {/* Trust signals */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <StaggerContainer className="grid grid-cols-2 gap-4 sm:grid-cols-4" stagger={0.06}>
            {trustSignals.map((sig) => {
              const Icon = sig.icon;
              return (
                <StaggerItem key={sig.label}>
                  <GlowCard className="flex h-full flex-col items-center justify-center rounded-2xl border [border-color:var(--mk-border)] p-5 text-center transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)]">
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
            <SectionHeading
              title={
                audience === "professional"
                  ? ui.noGamesTitle
                  : en
                    ? "Private access without hidden scope"
                    : "Privatzugang ohne versteckten Umfang"
              }
              sub={
                audience === "professional"
                  ? ui.noGamesSub
                  : en
                    ? "The product boundary remains visible before registration."
                    : "Die Produktgrenze bleibt bereits vor der Registrierung sichtbar."
              }
            />
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
        title={
          audience === "professional"
            ? ui.stillQuestions
            : en
              ? "Start with one defined question"
              : "Starte mit einer klaren Frage"
        }
        sub={
          audience === "professional"
            ? ui.writeUs
            : en
              ? "Quick Check is free; paid private access is still request-only."
              : "Der Schnellcheck ist kostenlos; bezahlte Privatangebote sind noch anfragebasiert."
        }
        href={p(
          lang,
          audience === "professional" ? "/signup?plan=pro" : "/signup?audience=private&plan=free"
        )}
        label={
          audience === "professional"
            ? en
              ? "Start Solo"
              : "Solo starten"
            : en
              ? "Start Quick Check"
              : "Schnellcheck starten"
        }
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={ui.writeUs}
        showLogo={false}
      />
    </div>
  );
}
