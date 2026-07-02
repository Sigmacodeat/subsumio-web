"use client";

import Link from "next/link";
import { motion } from "framer-motion";
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
import {
  Section,
  SectionHeading,
  BadgePill,
  H1_CLASS,
  ContentCard,
  CTASection,
} from "@/components/marketing/chrome";
import {
  ClipReveal,
  StaggerContainer,
  StaggerItem,
  EASE,
} from "@/components/marketing/motion-system";

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

export default function TaxMarketingPage() {
  return (
    <div
      data-tone="light"
      data-industry="tax"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      style={styleForIndustry("tax")}
    >
      {/* Hero */}
      <Section tone="light" className="px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE.out }}
          >
            <BadgePill>
              <Calculator size={12} /> Subsumio Tax
            </BadgePill>
          </motion.div>
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className={H1_CLASS}>
              Mandantengedächtnis mit
              <br />
              <span className="brand-text">Steuerfristen-Disziplin</span>
            </h1>
          </ClipReveal>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: EASE.out }}
          >
            Die KI-Wissensbasis für Steuerberatung und Buchhaltung. Steuererklärungen, Bescheide,
            Fristen und Dokumente bleiben als Finanz-Graph verbunden.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2, ease: EASE.out }}
          >
            <Link href="/signup">
              <Button size="xl" variant="primary" className="group min-w-[220px]">
                Kostenlos starten
                <ArrowRight
                  size={18}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="xl" variant="secondary" className="min-w-[180px]">
                Preise ansehen
              </Button>
            </Link>
          </motion.div>
        </div>
      </Section>

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
      <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
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
        href="/signup"
        label="Jetzt registrieren"
      />
    </div>
  );
}
