// Subsumio product subpages — Produkt, WhatsApp-Copilot, Sicherheit & DSGVO.
// These break the deep content off the (now focused) homepage funnel. Each is
// light-dominant with dark spotlight bands, composed from the same primitives
// the homepage uses so nothing drifts. Marketing copy is single-source here
// (mirrors the COPY pattern in subsumio-showcase.tsx); product facts come from
// VERTICALS.legal so claims stay consistent with the engine.

import Link from "next/link";
import { ArrowRight, MessageSquare, Clock, Paperclip, Mic, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contentFor, pBind, type Market } from "@/lib/market";
import { styleForIndustry } from "@/lib/industry-theme";
import { Section, SectionHeading, PageHero, CTASection } from "./primitives";
import { H2_CTA_CLASS, H3_CLASS, SECTION_PAD } from "./typography";
import { PhoneCopilot } from "./subsumio-showcase";
import { StaggerContainer, StaggerItem } from "./motion-system";

// --- Copy ------------------------------------------------------------------

const COPY = {
  whatsapp: {
    eyebrow: "Komfort-Kanal für unterwegs",
    title: "Die Kanzlei",
    claim: "in der Hosentasche.",
    sub: "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Assistent erkennt die Akte und legt alles erst nach Ihrer Bestätigung ab.",
    flowsTitle: "Drei Handgriffe, die jeder Anwalt sofort versteht",
    confidentialityTitle: "Ein Zusatzkanal — die Verschwiegenheit bleibt Ihre Entscheidung",
    ctaTitle: "Vom ersten Tag produktiv.",
    ctaSub: "Keine neue App, keine Schulung — die Nummer einspeichern und loslegen.",
    ctaLabel: "Assistent ausprobieren",
  },
} as const;

// --- Pages -----------------------------------------------------------------

export function WhatsAppPage({ market = "at" }: { market?: Market }) {
  const { ui: UI_STRINGS, security: SECURITY } = contentFor(market);
  const p = pBind(market);

  const c = COPY.whatsapp;
  const signup = p("/signup?industry=legal");
  const ui = UI_STRINGS;
  const confidentiality = SECURITY.faq.find((f) => f.q.includes("WhatsApp"));
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
            <Button size="xl" variant="primary" className="min-w-[220px]" asChild>
              <Link href={signup}>{c.ctaLabel}</Link>
            </Button>
            <Button size="xl" variant="secondary" className="min-w-[180px]" asChild>
              <Link href={p("/")}>
                {UI_STRINGS.backToOverview} <ArrowRight size={16} />
              </Link>
            </Button>
          </>
        }
      />
      <Section tone="dark" className={SECTION_PAD}>
        <div className="mx-auto max-w-md">
          <PhoneCopilot />
        </div>
      </Section>
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.flowsTitle} />
          <StaggerContainer className="grid gap-6 md:grid-cols-3" stagger={0.08}>
            {flows.map((f) => (
              <StaggerItem key={f.t} className="h-full">
                <div
                  className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
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
          <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm [color:var(--mk-text-muted)]">
            <MessageSquare size={14} className="brand-text shrink-0" />
            {UI_STRINGS.subpagesConfirmationNote}
          </p>
        </div>
      </Section>
      {/* The question every lawyer asks next — answered here, with the same
          wording as the security page (single source: SECURITY.faq). */}
      {confidentiality && (
        <Section tone="light" className={`${SECTION_PAD} pt-0`}>
          <div className="mx-auto grid max-w-5xl gap-8 rounded-3xl border [border-color:var(--mk-border)] p-8 [box-shadow:var(--mk-card-shadow)] [background:var(--mk-surface)] md:grid-cols-[auto_minmax(0,1fr)] md:gap-10 md:p-12">
            <div className="brand-soft brand-border flex h-12 w-12 items-center justify-center rounded-xl border">
              <ShieldCheck size={22} strokeWidth={1.75} className="brand-text" />
            </div>
            <div>
              <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{c.confidentialityTitle}</h2>
              <p className="mb-6 max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                {confidentiality.a}
              </p>
              <Link
                href={p("/security")}
                className="brand-text group inline-flex items-center gap-1.5 text-sm font-semibold"
              >
                {UI_STRINGS.exploreSecurity}
                <ArrowRight
                  size={14}
                  className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
        </Section>
      )}
      <CTASection
        title={c.ctaTitle}
        sub={c.ctaSub}
        href={signup}
        label={c.ctaLabel}
        secondaryHref={p("/contact")}
        secondaryLabel={UI_STRINGS.writeUs}
      />
    </div>
  );
}
