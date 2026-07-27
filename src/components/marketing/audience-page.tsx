"use client";

import {
  Building2,
  Check,
  FileSearch,
  MessageSquare,
  Scale,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  audienceCopy,
  privateOffers,
  professionalPricing,
  type Audience,
} from "@/content/audiences";
import { p, type Lang } from "@/content/site";
import { AudienceSwitcher } from "./audience-switcher";
import { PageHero, Section, SectionHeading, CTASection } from "./chrome";
import { PricingGrid } from "./pricing-grid";
import { PrivatePricingGrid } from "./private-pricing-grid";

export default function AudiencePage({ lang, audience }: { lang: Lang; audience: Audience }) {
  const en = !["de", "at", "ch"].includes(lang);
  const copy = audienceCopy(lang)[audience];
  const professional = audience === "professional";
  const pricing = professional ? professionalPricing(lang) : privateOffers(lang);

  const features = professional
    ? [
        {
          icon: Upload,
          title: en ? "Controlled ingestion" : "Kontrollierter Ingest",
          desc: en
            ? "Import individual matters in Solo or large document sets in Firm with traceable processing."
            : "Einzelne Akten in Solo oder große Dokumentbestände im Kanzlei-Tarif nachvollziehbar importieren.",
        },
        {
          icon: FileSearch,
          title: en ? "Cited case work" : "Belegte Aktenarbeit",
          desc: en
            ? "Answers link back to source passages; research, chronology and deadlines stay in matter context."
            : "Antworten führen zu Fundstellen zurück; Recherche, Chronologie und Fristen bleiben im Aktenkontext.",
        },
        {
          icon: Users,
          title: en ? "Roles and shared knowledge" : "Rollen und geteiltes Wissen",
          desc: en
            ? "Firm access adds matter-level permissions, shared institutional memory and administration."
            : "Der Kanzleizugang ergänzt aktenbezogene Rechte, gemeinsames Kanzleiwissen und Administration.",
        },
        {
          icon: MessageSquare,
          title: en ? "Communication workflows" : "Kommunikations-Workflows",
          desc: en
            ? "Firm plans add WhatsApp intake and repeatable communication processes without exposing unrelated matters."
            : "Kanzlei-Tarife ergänzen WhatsApp-Intake und wiederholbare Kommunikation, ohne fremde Akten offenzulegen.",
        },
      ]
    : [
        {
          icon: Upload,
          title: en ? "Selected documents" : "Ausgewählte Unterlagen",
          desc: en
            ? "Upload only the documents needed for one clearly defined private question."
            : "Lade nur die Unterlagen hoch, die für eine klar definierte private Fragestellung erforderlich sind.",
        },
        {
          icon: FileSearch,
          title: en ? "Understandable orientation" : "Verständliche Orientierung",
          desc: en
            ? "Receive a structured result with cited passages, risk indicators and possible next steps."
            : "Erhalte ein strukturiertes Ergebnis mit Fundstellen, Risikohinweisen und möglichen nächsten Schritten.",
        },
        {
          icon: ShieldCheck,
          title: en ? "Deliberately limited" : "Bewusst begrenzt",
          desc: en
            ? "No shared firm memory, employee roles, mass imports or professional billing functions."
            : "Kein geteiltes Kanzleiwissen, keine Mitarbeiterrollen, Massenimporte oder professionellen Abrechnungsfunktionen.",
        },
        {
          icon: Scale,
          title: en ? "Clear responsibility" : "Klare Verantwortung",
          desc: en
            ? "Automated orientation is not individual legal advice; urgent or complex cases belong with a lawyer."
            : "Automatisierte Orientierung ist keine individuelle Rechtsberatung; dringende oder komplexe Fälle gehören zu einer Kanzlei.",
        },
      ];

  const excluded = professional
    ? professionalPricing(lang).tiers.map((tier) => ({
        name: tier.name,
        included:
          tier.id === "pro"
            ? [
                en ? "One user" : "Ein Nutzer",
                en ? "Own matters" : "Eigene Akten",
                en ? "Standard document import" : "Standard-Dokumentimport",
              ]
            : tier.id === "team"
              ? [
                  en ? "Five users included" : "Fünf Nutzer inklusive",
                  en ? "Bulk ingestion" : "Massen-Ingest",
                  en ? "WhatsApp workflows" : "WhatsApp-Workflows",
                ]
              : [
                  en ? "Custom deployment" : "Individueller Betrieb",
                  "SSO/SAML",
                  en ? "Migration and SLA" : "Migration und SLA",
                ],
      }))
    : [];

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
    >
      <PageHero
        badge={copy.eyebrow}
        h1a={copy.title}
        sub={copy.description}
        icon={professional ? Building2 : Scale}
      />

      <Section tone="light" className="px-4 pb-20 sm:px-6 lg:px-8">
        <AudienceSwitcher lang={lang} active={audience} compact />
      </Section>

      <Section tone="light" className="px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            title={
              professional
                ? en
                  ? "Built for professional case work"
                  : "Für professionelle Aktenarbeit gebaut"
                : en
                  ? "What private access does — and does not do"
                  : "Was der Privatzugang leistet – und was nicht"
            }
            sub={
              professional
                ? en
                  ? "Capability grows with operational responsibility: Solo, Firm, Enterprise."
                  : "Der Funktionsumfang wächst mit der betrieblichen Verantwortung: Solo, Kanzlei, Enterprise."
                : pricing.sub
            }
          />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <article
                key={title}
                className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-bg)]"
              >
                <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                  <Icon size={20} className="brand-text" />
                </div>
                <h3 className="font-semibold [color:var(--mk-text)]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </Section>

      {professional && (
        <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              title={
                en
                  ? "The boundary between Solo, Firm and Enterprise"
                  : "Die Grenze zwischen Solo, Kanzlei und Enterprise"
              }
            />
            <div className="grid gap-5 md:grid-cols-3">
              {excluded.map((plan) => (
                <article
                  key={plan.name}
                  className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
                >
                  <h3 className="text-xl font-semibold [color:var(--mk-text)]">{plan.name}</h3>
                  <ul className="mt-5 space-y-3">
                    {plan.included.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-sm [color:var(--mk-text-muted)]"
                      >
                        <Check size={15} className="brand-text mt-0.5 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </Section>
      )}

      {!professional && (
        <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-2xl border [border-color:var(--mk-border)] p-7 [background:var(--mk-surface)]">
            <h2 className="text-xl font-semibold [color:var(--mk-text)]">
              {en ? "Not included in private access" : "Nicht im Privatzugang enthalten"}
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(en
                ? [
                    "Bulk ingestion",
                    "Employee and matter roles",
                    "Shared firm knowledge",
                    "WhatsApp secretary and DATEV workflows",
                  ]
                : [
                    "Massen-Ingest",
                    "Mitarbeiter- und Aktenrollen",
                    "Geteiltes Kanzleiwissen",
                    "WhatsApp-Sekretariat und DATEV-Workflows",
                  ]
              ).map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 text-sm [color:var(--mk-text-muted)]"
                >
                  <X size={15} className="text-rose-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section tone="light" className="px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={pricing.title} sub={pricing.sub} />
          {professional ? <PricingGrid lang={lang} /> : <PrivatePricingGrid lang={lang} />}
        </div>
      </Section>

      <CTASection
        title={
          professional
            ? en
              ? "Start with the plan that matches your operating model"
              : "Starte mit dem Tarif, der zu deinem Betriebsmodell passt"
            : en
              ? "Start with one clearly defined question"
              : "Starte mit einer klar abgegrenzten Frage"
        }
        sub={
          professional
            ? en
              ? "Solo can grow into Firm without changing the underlying matter model."
              : "Solo kann ohne Wechsel des zugrunde liegenden Aktenmodells zur Kanzlei wachsen."
            : en
              ? "For urgent deadlines or individual advice, contact a qualified lawyer."
              : "Bei dringenden Fristen oder individuellem Beratungsbedarf wende dich an eine qualifizierte Kanzlei."
        }
        href={p(lang, professional ? "/signup?plan=pro" : "/signup?audience=private&plan=free")}
        label={
          professional
            ? en
              ? "Start Solo"
              : "Solo starten"
            : en
              ? "Start quick check"
              : "Schnellcheck starten"
        }
        secondaryHref={p(lang, "/pricing")}
        secondaryLabel={en ? "Compare all prices" : "Alle Preise vergleichen"}
        showLogo={false}
      />
    </div>
  );
}
