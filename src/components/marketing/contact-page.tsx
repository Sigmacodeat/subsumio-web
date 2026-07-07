"use client";

import { Mail, MessageSquare, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import { Section, SectionHeading, PageHero, CTASection, IconTile } from "./chrome";
import { GlowCard, EASE, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

const _deContact = {
  badge: "Kontakt",
  h1a: "Sprich mit unserem Team.",
  h1b: "Wir sprechen deine Sprache.",
  sub: "Fragen zu Subsumio, Self-Hosting, Enterprise-Plänen oder Partnerschaften? Erreich uns — wir antworten innerhalb eines Werktages.",
  channelsTitle: "So erreichst du uns",
  channels: [
    {
      icon: "Mail",
      title: "E-Mail",
      value: "hello@subsum.eu",
      desc: "Allgemeine Fragen, Verkauf, Partnerschaften. Wir antworten innerhalb eines Werktages.",
      href: "mailto:hello@subsum.eu",
    },
    {
      icon: "MessageSquare",
      title: "WhatsApp",
      value: "+43 …",
      desc: "Kurze Fragen? Schreib uns auf WhatsApp — wir sind während der Geschäftszeiten da.",
      href: "https://wa.me/43",
    },
    {
      icon: "FileText",
      title: "Datenschutz",
      value: "dsb@subsum.eu",
      desc: "Für deinen Datenschutzbeauftragten — AVV, technische-organisatorische Maßnahmen.",
      href: "mailto:dsb@subsum.eu",
    },
  ],
  formTitle: "Schreib uns eine Nachricht",
  formName: "Dein Name",
  formEmail: "Deine E-Mail",
  formFirm: "Kanzleiname",
  formMessage: "Deine Nachricht",
  formSubmit: "Nachricht senden",
  formNote: "Wir melden uns innerhalb eines Werktages. Kein Spam, niemals.",
  ctaTitle: "Lieber erst ausprobieren?",
  ctaSub: "Starte einen 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte.",
  ctaButton: "Jetzt starten",
} as const;

const CONTENT = {
  en: {
    badge: "Contact",
    h1a: "Talk to our team.",
    h1b: "We speak your language.",
    sub: "Questions about Subsumio, self-hosting, enterprise plans or partnerships? Reach us — we answer within one business day.",
    channelsTitle: "How to reach us",
    channels: [
      {
        icon: "Mail",
        title: "Email",
        value: "hello@subsum.eu",
        desc: "General questions, sales, partnerships. We reply within one business day.",
        href: "mailto:hello@subsum.eu",
      },
      {
        icon: "MessageSquare",
        title: "WhatsApp",
        value: "+43 …",
        desc: "Quick questions? Message us on WhatsApp — we're there during business hours.",
        href: "https://wa.me/43",
      },
      {
        icon: "FileText",
        title: "Data Protection",
        value: "dsb@subsum.eu",
        desc: "For your data protection officer — DPA, AVV, technical-organisational measures.",
        href: "mailto:dsb@subsum.eu",
      },
    ],
    formTitle: "Send us a message",
    formName: "Your name",
    formEmail: "Your email",
    formFirm: "Firm name",
    formMessage: "Your message",
    formSubmit: "Send message",
    formNote: "We'll get back to you within one business day. No spam, ever.",
    ctaTitle: "Prefer to try first?",
    ctaSub: "Start a 14-day reverse trial — full access, no credit card.",
    ctaButton: "Get started",
  },
  de: _deContact,
  at: _deContact,
  ch: _deContact,
};

const ICON_MAP = { Mail, MessageSquare, FileText };

export default function ContactPage({ lang }: { lang: Lang }) {
  const c = (CONTENT as unknown as Record<string, typeof CONTENT.de>)[lang] ?? CONTENT.de;
  return (
    <>
      <PageHero badge={c.badge} h1a={c.h1a} h1b={c.h1b} sub={c.sub} />

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.channelsTitle} tone="light" />
          <StaggerContainer className="grid gap-4 md:grid-cols-3" stagger={0.08}>
            {c.channels.map((ch) => {
              const Icon = ICON_MAP[ch.icon as keyof typeof ICON_MAP] ?? Mail;
              return (
                <StaggerItem key={ch.title}>
                  <a href={ch.href} className="group rounded-2xl transition-all">
                    <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--brand-primary)] hover:shadow-xl">
                      <IconTile icon={Icon} />
                      <h3 className="mb-1 text-base font-semibold [color:var(--mk-text)]">
                        {ch.title}
                      </h3>
                      <p className="brand-text mb-2 font-mono text-sm">{ch.value}</p>
                      <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                        {ch.desc}
                      </p>
                    </GlowCard>
                  </a>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <SectionHeading title={c.formTitle} tone="light" />
          <Reveal variant="up" delay={0.1}>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                const name = String(data.get("name") ?? "");
                const email = String(data.get("email") ?? "");
                const firm = String(data.get("firm") ?? "");
                const message = String(data.get("message") ?? "");
                const subject = `Subsumio contact — ${name}${firm ? ` (${firm})` : ""}`;
                const body = [
                  `Name: ${name}`,
                  `E-Mail: ${email}`,
                  firm && `Kanzlei: ${firm}`,
                  "",
                  message,
                ]
                  .filter(Boolean)
                  .join("\n");
                window.location.href = `mailto:hello@subsum.eu?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  name="name"
                  placeholder={c.formName}
                  aria-label={c.formName}
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
                />
                <input
                  type="email"
                  name="email"
                  placeholder={c.formEmail}
                  aria-label={c.formEmail}
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
                />
              </div>
              <input
                type="text"
                name="firm"
                placeholder={c.formFirm}
                aria-label={c.formFirm}
                autoComplete="organization"
                className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
              />
              <textarea
                name="message"
                placeholder={c.formMessage}
                aria-label={c.formMessage}
                required
                rows={5}
                className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
              />
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs [color:var(--mk-text-subtle)]">{c.formNote}</p>
                <Button
                  type="submit"
                  size="lg"
                  variant="primary"
                  className="group min-h-[48px] shrink-0"
                >
                  {c.formSubmit}
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Button>
              </div>
            </form>
          </Reveal>
        </div>
      </Section>

      <CTASection title={c.ctaTitle} sub={c.ctaSub} href={p(lang, "/signup")} label={c.ctaButton} />
    </>
  );
}
