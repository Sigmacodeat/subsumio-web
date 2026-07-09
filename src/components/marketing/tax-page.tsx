"use client";

import Link from "next/link";
import {
  FileText,
  CalendarClock,
  ShieldCheck,
  Brain,
  CheckCircle2,
  ArrowRight,
  Calculator,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { styleForIndustry } from "@/lib/industry-theme";
import { p, UI_STRINGS, DEFAULT_LANG, type Lang } from "@/content/site";
import {
  Section,
  SectionHeading,
  PageHero,
  ContentCard,
  CTASection,
} from "@/components/marketing/chrome";
import { StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";

const FEATURES = [
  {
    icon: FileText,
    title: "Steuererklärungen",
    desc: "ESt, USt, GewSt, KSt, LSt — strukturiert erfasst mit Status-Tracking vom Entwurf bis zum Bescheid.",
  },
  {
    icon: CalendarClock,
    title: "AO-Fristen-Engine",
    desc: "Automatische Fristberechnung nach Abgabenordnung. Weekend/Holiday-Shifting, Einspruchsfristen, Festsetzungsverjährung.",
  },
  {
    icon: Calculator,
    title: "StBVV-Gebührenrechner",
    desc: "Gebührenberechnung nach Steuerberatervergütungsverordnung — analog zum bewährten RVG-Rechner für Anwälte.",
  },
  {
    icon: ShieldCheck,
    title: "GoBD & DSGVO",
    desc: "Verfahrensdokumentation, GoBD-konforme Archivierung, DSGVO-Compliance — bereits im Legal-Product erprobt.",
  },
  {
    icon: Brain,
    title: "GBrain Mandantengedächtnis",
    desc: "Steuererklärungen, Bescheide, Fristen und Dokumente bleiben als Finanz-Graph verbunden. Kompiliertes Wissen pro Mandant.",
  },
  {
    icon: Landmark,
    title: "Bescheide & Einsprüche",
    desc: "Bescheid-Management mit Einspruchsfrist-Tracking, Festsetzungsverjährung und Kontext-Verlinkung zur Erklärung.",
  },
];

const SIGNATURE_ITEMS = [
  "Widersprüche in Steuerfristen",
  "AO-bewusste Fristenantworten",
  "Zitierter Bescheidkontext",
];

export default function TaxPage({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  return (
    <div
      data-tone="light"
      data-industry="tax"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      style={styleForIndustry("tax")}
      lang={lang}
    >
      {/* Hero */}
      <PageHero
        badge="Subsumio Tax"
        h1a="Mandantengedächtnis mit"
        h1b="Steuerfristen-Disziplin"
        sub="Die KI-Wissensbasis für Steuerberatung und Buchhaltung. Steuererklärungen, Bescheide, Fristen und Dokumente bleiben als Finanz-Graph verbunden."
        icon={Calculator}
        actions={
          <>
            <Link href={p(lang, "/signup")}>
              <Button size="xl" variant="primary" className="group min-w-[220px]">
                {UI_STRINGS[lang].startFree}
                <ArrowRight
                  size={18}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Button>
            </Link>
            <Link href={p(lang, "/pricing")}>
              <Button size="xl" variant="secondary" className="min-w-[180px]">
                {UI_STRINGS[lang].seePlans}
              </Button>
            </Link>
          </>
        }
      />

      {/* Signature Items */}
      <Section tone="light" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <StaggerContainer className="grid gap-6 sm:grid-cols-3">
            {SIGNATURE_ITEMS.map((item) => (
              <StaggerItem key={item}>
                <div className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]">
                  <CheckCircle2 size={20} className="brand-text shrink-0" />
                  <span className="text-sm font-medium [color:var(--mk-text)]">{item}</span>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      {/* Features */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading
            badge="Features"
            title="Alles für den Steuerberater-Workflow"
            sub="Von der Erklärung bis zum Bescheid — vollständig vernetzt im GBrain Mandantengedächtnis."
          />
          <StaggerContainer className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <StaggerItem key={f.title}>
                <ContentCard icon={f.icon} title={f.title} desc={f.desc} />
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title="Bereit für steuerliche Präzision?"
        sub="Starte heute mit Subsumio Tax — kein Seat-Minimum, DSGVO-konform, EU-Cloud."
        href={p(lang, "/signup")}
        label={UI_STRINGS[lang].startFree}
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={UI_STRINGS[lang].writeUs}
      />
    </div>
  );
}
