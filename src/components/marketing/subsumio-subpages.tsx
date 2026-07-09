"use client";

// Subsumio product subpages — Produkt, WhatsApp-Copilot, Sicherheit & DSGVO.
// These break the deep content off the (now focused) homepage funnel. Each is
// light-dominant with dark spotlight bands, composed from the same primitives
// the homepage uses so nothing drifts. Marketing copy is single-source here
// (mirrors the COPY pattern in subsumio-showcase.tsx); product facts come from
// VERTICALS[lang].legal so claims stay consistent with the engine.

import Link from "next/link";
import { ArrowRight, MessageSquare, Clock, Paperclip, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { styleForIndustry } from "@/lib/industry-theme";
import { Section, SectionHeading, PageHero, CTASection, H3_CLASS } from "./chrome";
import { PhoneCopilot } from "./subsumio-showcase";
import { StaggerContainer, StaggerItem } from "./motion-system";

// --- Copy ------------------------------------------------------------------

const _deSubpages = {
  whatsapp: {
    eyebrow: "Komfort-Kanal für unterwegs",
    title: "Die Kanzlei",
    claim: "in der Hosentasche.",
    sub: "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
    flowsTitle: "Drei Handgriffe, die jeder Anwalt sofort versteht",
    ctaTitle: "Vom ersten Tag produktiv.",
    ctaSub: "Keine neue App, keine Schulung — die Nummer einspeichern und loslegen.",
    ctaLabel: "Copilot ausprobieren",
  },
} as const;

const COPY = {
  de: _deSubpages,
  at: _deSubpages,
  ch: _deSubpages,
  en: {
    whatsapp: {
      eyebrow: "Convenience on the go",
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
  const c = ((COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de).whatsapp;
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
    <div
      data-tone="light"
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
      style={styleForIndustry("legal")}
    >
      <PageHero
        badge={c.eyebrow}
        h1a={c.title}
        h1b={c.claim}
        sub={c.sub}
        accentVariant="gradient"
        actions={
          <>
            <Link href={signup}>
              <Button size="xl" variant="primary" className="min-w-[220px]">
                {c.ctaLabel}
              </Button>
            </Link>
            <Link href={p(lang, "/")}>
              <Button size="xl" variant="secondary" className="min-w-[180px]">
                {UI_STRINGS[lang].backToOverview} <ArrowRight size={16} />
              </Button>
            </Link>
          </>
        }
      />
      <Section tone="dark" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md">
          <PhoneCopilot lang={lang} />
        </div>
      </Section>
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.flowsTitle} />
          <StaggerContainer className="grid gap-6 md:grid-cols-3" stagger={0.08}>
            {flows.map((f) => (
              <StaggerItem key={f.t}>
                <div
                  className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
                  style={{ boxShadow: "var(--mk-card-shadow)" }}
                >
                  <div className="brand-soft brand-border mb-4 flex h-10 w-10 items-center justify-center rounded-lg border">
                    <f.icon size={18} className="brand-text" />
                  </div>
                  <h3 className={`mb-2 ${H3_CLASS}`}>{f.t}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{f.d}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <p className="mx-auto mt-8 inline-flex w-full max-w-2xl items-center justify-center gap-2 text-center text-sm [color:var(--mk-text-subtle)]">
            <MessageSquare size={14} className="brand-text shrink-0" />
            {UI_STRINGS[lang].subpagesConfirmationNote}
          </p>
        </div>
      </Section>
      <CTASection
        title={c.ctaTitle}
        sub={c.ctaSub}
        href={signup}
        label={c.ctaLabel}
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={UI_STRINGS[lang].writeUs}
      />
    </div>
  );
}
