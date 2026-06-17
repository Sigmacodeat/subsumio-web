"use client";

// Subsumio product subpages — Produkt, WhatsApp-Copilot, Sicherheit & DSGVO.
// These break the deep content off the (now focused) homepage funnel. Each is
// light-dominant with dark spotlight bands, composed from the same primitives
// the homepage uses so nothing drifts. Marketing copy is single-source here
// (mirrors the COPY pattern in subsumio-showcase.tsx); product facts come from
// VERTICALS[lang].legal so claims stay consistent with the engine.

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, ShieldCheck, Lock, EyeOff, FileSignature, Network, ScanSearch,
  MessageSquare, Clock, Paperclip, Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaMark } from "@/components/brand/logo";
import { p, type Lang } from "@/content/site";
import { styleForIndustry } from "@/lib/industry-theme";
import {
  MarketingBackground, MarketingNav, MarketingFooter, Section, SectionHeading,
} from "./chrome";
import { WhatsAppSpotlight, FeatureBento, PhoneCopilot } from "./subsumio-showcase";
import ProductWorkflowShowcase from "./product-workflow-showcase";
import DashboardReel from "./dashboard-reel";
import TrustBand from "./trust-band";

const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: "easeOut" as const },
};

// --- Shared subpage shell --------------------------------------------------

function Shell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <div className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang} style={styleForIndustry("legal")}>
      <MarketingBackground />
      <MarketingNav lang={lang} theme="slate" />
      {children}
      <MarketingFooter lang={lang} />
    </div>
  );
}

function Hero({
  lang, eyebrow, title, claim, sub, primaryHref, primaryLabel,
}: {
  lang: Lang; eyebrow: string; title: string; claim: string; sub: string;
  primaryHref: string; primaryLabel: string;
}) {
  return (
    <Section tone="light" className="pt-16 pb-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div {...reveal}>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border brand-border brand-soft text-xs brand-text font-semibold mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-pulse" /> {eyebrow}
          </span>
          <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.07] tracking-tight mb-5">
            {title}<br />
            <span className="gradient-text">{claim}</span>
          </h1>
          <p className="text-lg [color:var(--mk-text-muted)] max-w-2xl mx-auto mb-9 leading-relaxed">{sub}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={primaryHref}>
              <Button size="xl" variant="glow" className="min-w-[220px]">
                <SigmaMark size={18} tile={false} /> {primaryLabel}
              </Button>
            </Link>
            <Link href={p(lang, "/")}>
              <Button size="xl" variant="secondary" className="min-w-[180px]">
                {lang === "de" ? "Zur Übersicht" : "Back to overview"} <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

function CtaClose({ lang, title, sub, href, label }: { lang: Lang; title: string; sub: string; href: string; label: string }) {
  return (
    <Section tone="dark" className="py-24 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        <SigmaMark size={56} className="mx-auto mb-7" />
        <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{title}</h2>
        <p className="text-lg [color:var(--mk-text-muted)] mb-9">{sub}</p>
        <Link href={href}>
          <Button size="xl" variant="glow">{label} <ArrowRight size={18} /></Button>
        </Link>
      </div>
    </Section>
  );
}

// --- Copy ------------------------------------------------------------------

const COPY = {
  de: {
    produkt: {
      eyebrow: "Produkt",
      title: "Das Kanzlei-Gehirn,",
      claim: "in einem System.",
      sub: "Akten, Fristen, Zeiten, Auslagen, Rechnungen und der WhatsApp-Copilot — alles auf eurer Infrastruktur, jede Antwort mit Fundstelle.",
      ctaTitle: "Starte mit einer Akte.",
      ctaSub: "Eine abgeschlossene Akte als Pilot — kein Mandantendatum muss euer Haus verlassen.",
      ctaLabel: "Kanzlei-Gehirn starten",
    },
    whatsapp: {
      eyebrow: "Der Winning USP",
      title: "Die Kanzlei",
      claim: "in der Hosentasche.",
      sub: "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
      flowsTitle: "Drei Handgriffe, die jeder Anwalt sofort versteht",
      ctaTitle: "Vom ersten Tag produktiv.",
      ctaSub: "Keine neue App, keine Schulung — die Nummer einspeichern und loslegen.",
      ctaLabel: "Copilot ausprobieren",
    },
    sicherheit: {
      eyebrow: "Sicherheit & DSGVO",
      title: "Vertraulichkeit",
      claim: "durch Architektur.",
      sub: "Self-hosted auf eurer Hardware oder in der EU-Cloud mit AVV. Mandantendaten verlassen nie eure Kontrolle — und werden niemals zum KI-Training genutzt.",
      pointsTitle: "Gebaut für Berufsgeheimnisträger",
      points: [
        { icon: ShieldCheck, t: "§ 203 StGB im Blick", d: "Verschwiegenheit ist kein Add-on: Self-Hosting oder EU-Cloud mit gesonderter Verschwiegenheitsverpflichtung für mitwirkende Personen." },
        { icon: Lock, t: "Eure Infrastruktur, eure Schlüssel", d: "Die Engine läuft auf eurer Hardware mit lokalem Speicher — oder in unserer EU-Cloud mit AVV und verschlüsseltem Objektspeicher." },
        { icon: EyeOff, t: "Kein Training auf euren Daten", d: "Mandanteninhalte werden ausschließlich zur Leistungserbringung verarbeitet — niemals zum Training geteilter Modelle." },
        { icon: FileSignature, t: "AVV & DSGVO", d: "Auftragsverarbeitungsvertrag (Art. 28 DSGVO) als Vorlage, EU-Standardvertragsklauseln für jeden Drittland-Transfer." },
        { icon: Network, t: "Akten- & Mandanten-Isolation", d: "Zugriff pro Akte und pro Nutzer abgegrenzt — über jeden Lesepfad, fuzz-getestet auf null Leaks zwischen Mandaten." },
        { icon: ScanSearch, t: "Jede Antwort mit Fundstelle", d: "Antworten zitieren die exakte Seite. Erfundene Zitate werden vor der Ausgabe verworfen — Schutz gegen Halluzination." },
      ],
      ctaTitle: "Lass euren Datenschutzbeauftragten mit uns sprechen.",
      ctaSub: "Wir kennen § 203 StGB, AVV und EU-Hosting — und sprechen die Sprache eurer Compliance.",
      ctaLabel: "Sicherheit besprechen",
    },
  },
  en: {
    produkt: {
      eyebrow: "Product",
      title: "The law firm's brain,",
      claim: "in one system.",
      sub: "Matters, deadlines, time, expenses, invoices and the WhatsApp copilot — all on your infrastructure, every answer cited.",
      ctaTitle: "Start with one matter.",
      ctaSub: "Run one closed matter as a pilot — no client data needs to leave your building.",
      ctaLabel: "Start your case brain",
    },
    whatsapp: {
      eyebrow: "The winning USP",
      title: "The firm",
      claim: "in your pocket.",
      sub: "Book time, file documents, query matters — from your phone, no app switch, no training. The copilot understands the matter and files everything for confirmation.",
      flowsTitle: "Three moves every lawyer gets instantly",
      ctaTitle: "Productive on day one.",
      ctaSub: "No new app, no training — save the number and start.",
      ctaLabel: "Try the copilot",
    },
    sicherheit: {
      eyebrow: "Security & GDPR",
      title: "Confidentiality",
      claim: "by architecture.",
      sub: "Self-hosted on your hardware or in the EU cloud with a DPA. Client data never leaves your control — and is never used to train AI.",
      pointsTitle: "Built for professional secrecy",
      points: [
        { icon: ShieldCheck, t: "Professional secrecy first", d: "Confidentiality isn't an add-on: self-host, or EU cloud with a separate confidentiality undertaking for everyone involved." },
        { icon: Lock, t: "Your infrastructure, your keys", d: "Run the engine on your hardware with local storage — or our EU cloud with a DPA and encrypted object storage." },
        { icon: EyeOff, t: "No training on your data", d: "Client content is processed only to deliver the service — never to train shared models." },
        { icon: FileSignature, t: "DPA & GDPR", d: "Data-processing agreement (Art. 28 GDPR) template, EU standard contractual clauses for any third-country transfer." },
        { icon: Network, t: "Matter & client isolation", d: "Access scoped per matter and per user across every read path — fuzz-tested for zero leaks between mandates." },
        { icon: ScanSearch, t: "Every answer cited", d: "Answers cite the exact page. Fabricated citations are dropped before output — protection against hallucination." },
      ],
      ctaTitle: "Let your DPO talk to us.",
      ctaSub: "We know professional secrecy, DPAs and EU hosting — and we speak your compliance team's language.",
      ctaLabel: "Discuss security",
    },
  },
} as const;

// --- Pages -----------------------------------------------------------------

export function ProduktPage({ lang }: { lang: Lang }) {
  const c = COPY[lang].produkt;
  const signup = p(lang, "/signup?industry=legal");
  return (
    <Shell lang={lang}>
      <Hero lang={lang} eyebrow={c.eyebrow} title={c.title} claim={c.claim} sub={c.sub} primaryHref={signup} primaryLabel={c.ctaLabel} />
      <WhatsAppSpotlight lang={lang} />
      <div data-tone="light" style={{ background: "var(--mk-bg)" }}>
        <ProductWorkflowShowcase lang={lang} industry="legal" />
      </div>
      <Section tone="light" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading
            title={lang === "de" ? "Datei anhängen. Fragen. Belegte Antwort." : "Attach a file. Ask. Cited answer."}
            sub={lang === "de"
              ? "Per Upload, Google Drive oder Anwaltssoftware ins Brain — dann im Chat fragen, mit seitengenauen Fundstellen."
              : "Bring files in via upload, Google Drive or your practice software — then ask in chat, with page-level sources."}
          />
          <DashboardReel lang={lang} industry="legal" />
        </div>
      </Section>
      <Section tone="dark">
        <FeatureBento lang={lang} />
      </Section>
      <CtaClose lang={lang} title={c.ctaTitle} sub={c.ctaSub} href={signup} label={c.ctaLabel} />
    </Shell>
  );
}

export function WhatsAppPage({ lang }: { lang: Lang }) {
  const c = COPY[lang].whatsapp;
  const signup = p(lang, "/signup?industry=legal");
  const flows = [
    { icon: Clock, t: lang === "de" ? "Zeit & Auslagen in Sekunden" : "Time & expenses in seconds", d: lang === "de" ? "„Zeit 0,5h Akte Müller, Telefonat“ → erfasst, der Akte zugeordnet, ein Tipp zum Bestätigen." : "\"Time 0.5h matter Müller, call\" → captured, linked to the matter, one tap to confirm." },
    { icon: Paperclip, t: lang === "de" ? "Beleg-Foto → richtige Akte" : "Receipt photo → right matter", d: lang === "de" ? "Dokument oder Foto mit Akten-Kürzel in der Caption landet revisionssicher im Vault." : "A document or photo with the case reference in the caption lands in the vault, audit-ready." },
    { icon: Mic, t: lang === "de" ? "Sprachnotiz unterwegs" : "Voice note on the go", d: lang === "de" ? "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor du im Büro bist." : "Dictate after the hearing — transcribed and attached before you're back at the office." },
  ];
  return (
    <Shell lang={lang}>
      <Hero lang={lang} eyebrow={c.eyebrow} title={c.title} claim={c.claim} sub={c.sub} primaryHref={signup} primaryLabel={c.ctaLabel} />
      <Section tone="dark" className="py-16 px-6">
        <div className="max-w-md mx-auto">
          <PhoneCopilot lang={lang} />
        </div>
      </Section>
      <Section tone="light" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading title={c.flowsTitle} />
          <div className="grid md:grid-cols-3 gap-5">
            {flows.map((f, i) => (
              <motion.div
                key={f.t}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="p-6 rounded-2xl border [background:var(--mk-surface)] [border-color:var(--mk-border)]"
                style={{ boxShadow: "var(--mk-card-shadow)" }}
              >
                <div className="w-10 h-10 rounded-lg brand-soft border brand-border flex items-center justify-center mb-4">
                  <f.icon size={18} className="brand-text" />
                </div>
                <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2">{f.t}</h3>
                <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{f.d}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-center text-sm [color:var(--mk-text-subtle)] mt-8 max-w-2xl mx-auto inline-flex items-center gap-2 justify-center w-full">
            <MessageSquare size={14} className="brand-text shrink-0" />
            {lang === "de"
              ? "Alles bestätigungspflichtig — nichts landet ungesehen in der Akte."
              : "Everything confirmation-gated — nothing reaches the matter unseen."}
          </p>
        </div>
      </Section>
      <CtaClose lang={lang} title={c.ctaTitle} sub={c.ctaSub} href={signup} label={c.ctaLabel} />
    </Shell>
  );
}

export function SicherheitPage({ lang }: { lang: Lang }) {
  const c = COPY[lang].sicherheit;
  const contact = "mailto:hello@subsum.io";
  return (
    <Shell lang={lang}>
      <Hero lang={lang} eyebrow={c.eyebrow} title={c.title} claim={c.claim} sub={c.sub} primaryHref={contact} primaryLabel={c.ctaLabel} />
      <Section tone="light" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading title={c.pointsTitle} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {c.points.map((pt, i) => (
              <motion.div
                key={pt.t}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                whileHover={{ y: -4 }}
                className="p-6 rounded-2xl border [background:var(--mk-surface)] [border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)] transition-colors"
                style={{ boxShadow: "var(--mk-card-shadow)" }}
              >
                <div className="w-10 h-10 rounded-lg brand-soft border brand-border flex items-center justify-center mb-4">
                  <pt.icon size={18} className="brand-text" />
                </div>
                <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2">{pt.t}</h3>
                <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{pt.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>
      <div data-tone="light" style={{ background: "var(--mk-bg)" }}>
        <TrustBand lang={lang} />
      </div>
      <CtaClose lang={lang} title={c.ctaTitle} sub={c.ctaSub} href={contact} label={c.ctaLabel} />
    </Shell>
  );
}
