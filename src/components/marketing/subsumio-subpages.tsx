"use client";

// Subsumio product subpages — Produkt, WhatsApp-Copilot, Sicherheit & DSGVO.
// These break the deep content off the (now focused) homepage funnel. Each is
// light-dominant with dark spotlight bands, composed from the same primitives
// the homepage uses so nothing drifts. Marketing copy is single-source here
// (mirrors the COPY pattern in subsumio-showcase.tsx); product facts come from
// VERTICALS[lang].legal so claims stay consistent with the engine.

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MessageSquare, Clock, Paperclip, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { styleForIndustry } from "@/lib/industry-theme";
import { Section, SectionHeading } from "./chrome";
import { PhoneCopilot } from "./subsumio-showcase";
import { Reveal } from "./motion-system";

const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: "easeOut" as const },
};

// --- Shared subpage shell --------------------------------------------------

function Shell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <div
      data-tone="slate"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
      style={styleForIndustry("legal")}
    >
      {children}
    </div>
  );
}

function Hero({
  lang,
  eyebrow,
  title,
  claim,
  sub,
  primaryHref,
  primaryLabel,
}: {
  lang: Lang;
  eyebrow: string;
  title: string;
  claim: string;
  sub: string;
  primaryHref: string;
  primaryLabel: string;
}) {
  return (
    <Section tone="light" className="px-6 pt-16 pb-20">
      <div className="mx-auto max-w-4xl text-center">
        <motion.div {...reveal}>
          <span className="brand-border brand-soft brand-text mb-7 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
            <span className="badge-pulse h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />{" "}
            {eyebrow}
          </span>
          <h1 className="mb-5 text-[clamp(2.5rem,10vw,3.75rem)] leading-[1.07] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
            {title}
            <br />
            <span className="gradient-text">{claim}</span>
          </h1>
          <p className="mx-auto mb-9 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
            {sub}
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={primaryHref}>
              <Button size="xl" variant="glow" className="min-w-[220px]">
                <SubsumioMark size={18} tile={false} /> {primaryLabel}
              </Button>
            </Link>
            <Link href={p(lang, "/subsumio")}>
              <Button size="xl" variant="secondary" className="min-w-[180px]">
                {UI_STRINGS[lang].backToOverview} <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

function CtaClose({
  title,
  sub,
  href,
  label,
}: {
  lang?: Lang;
  title: string;
  sub: string;
  href: string;
  label: string;
}) {
  return (
    <Section tone="dark" className="px-4 py-24 text-center sm:px-6 lg:px-8">
      <Reveal variant="upLg" className="mx-auto max-w-3xl">
        <SubsumioMark size={56} className="mx-auto mb-7" />
        <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">{title}</h2>
        <p className="mb-9 text-lg [color:var(--mk-text-muted)]">{sub}</p>
        <Link href={href}>
          <Button size="xl" variant="glow">
            {label} <ArrowRight size={18} />
          </Button>
        </Link>
      </Reveal>
    </Section>
  );
}

// --- Copy ------------------------------------------------------------------

const COPY = {
  de: {
    whatsapp: {
      eyebrow: "Das stärkste Argument",
      title: "Die Kanzlei",
      claim: "in der Hosentasche.",
      sub: "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
      flowsTitle: "Drei Handgriffe, die jeder Anwalt sofort versteht",
      ctaTitle: "Vom ersten Tag produktiv.",
      ctaSub: "Keine neue App, keine Schulung — die Nummer einspeichern und loslegen.",
      ctaLabel: "Copilot ausprobieren",
    },
  },
  en: {
    whatsapp: {
      eyebrow: "The standout advantage",
      title: "The firm",
      claim: "in your pocket.",
      sub: "Book time, file documents, query matters — from your phone, no app switch, no training. The copilot understands the matter and files everything for confirmation.",
      flowsTitle: "Three moves every lawyer gets instantly",
      ctaTitle: "Productive on day one.",
      ctaSub: "No new app, no training — save the number and start.",
      ctaLabel: "Try the copilot",
    },
  },
} as const;

// --- Pages -----------------------------------------------------------------

export function WhatsAppPage({ lang }: { lang: Lang }) {
  const c = COPY[lang].whatsapp;
  const signup = p(lang, "/signup?industry=legal");
  const ui = UI_STRINGS[lang];
  const flows = [
    {
      icon: Clock,
      t: ui.timeExpenses,
      d: ui.timeExpensesDesc,
    },
    {
      icon: Paperclip,
      t: ui.receiptPhoto,
      d: ui.receiptPhotoDesc,
    },
    {
      icon: Mic,
      t: ui.voiceNote,
      d: ui.voiceNoteDesc,
    },
  ];
  return (
    <Shell lang={lang}>
      <Hero
        lang={lang}
        eyebrow={c.eyebrow}
        title={c.title}
        claim={c.claim}
        sub={c.sub}
        primaryHref={signup}
        primaryLabel={c.ctaLabel}
      />
      <Section tone="dark" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <PhoneCopilot lang={lang} />
        </div>
      </Section>
      <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.flowsTitle} />
          <div className="grid gap-5 md:grid-cols-3">
            {flows.map((f, i) => (
              <motion.div
                key={f.t}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
                style={{ boxShadow: "var(--mk-card-shadow)" }}
              >
                <div className="brand-soft brand-border mb-4 flex h-10 w-10 items-center justify-center rounded-lg border">
                  <f.icon size={18} className="brand-text" />
                </div>
                <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">{f.t}</h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{f.d}</p>
              </motion.div>
            ))}
          </div>
          <p className="mx-auto mt-8 inline-flex w-full max-w-2xl items-center justify-center gap-2 text-center text-sm [color:var(--mk-text-subtle)]">
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
