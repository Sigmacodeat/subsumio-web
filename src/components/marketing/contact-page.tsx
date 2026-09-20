"use client";

import { Mail, FileText, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS } from "@/content/site";
import { Section, SectionHeading, PageHero, CTASection, IconTile, H3_CLASS } from "./primitives";
import { GlowCard, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

const CONTENT = {
  badge: "Kontakt",
  h1a: "Sprechen Sie mit unserem Team.",
  h1b: "Antwort binnen eines Werktags.",
  sub: "Fragen zu Subsumio, On-Premise, dem Enterprise-Tarif oder einer Partnerschaft? Schreiben Sie uns.",
  channelsTitle: "So erreichen Sie uns",
  channels: [
    {
      icon: "Mail",
      title: "E-Mail",
      value: "hello@subsum.io",
      desc: "Allgemeine Fragen, Verkauf, Partnerschaften.",
      href: "mailto:hello@subsum.io",
    },
    {
      icon: "FileText",
      title: "Datenschutz",
      value: "dsb@subsum.io",
      desc: "Für Ihren Datenschutzbeauftragten — AVV, technische und organisatorische Maßnahmen.",
      href: "mailto:dsb@subsum.io",
    },
  ],
  formTitle: "Schreiben Sie uns eine Nachricht",
  formName: "Ihr Name",
  formEmail: "Ihre E-Mail",
  formFirm: "Kanzleiname",
  formMessage: "Ihre Nachricht",
  formSubmit: "Nachricht senden",
  formNote: "Ihre Angaben verwenden wir nur zur Beantwortung Ihrer Anfrage.",
  ctaTitle: "Lieber erst ausprobieren?",
  ctaSub: "Testen Sie Subsumio 14 Tage mit vollem Funktionsumfang — ohne Kreditkarte.",
  ctaButton: "14 Tage kostenlos testen",
} as const;

const ICON_MAP = { Mail, FileText };

export default function ContactPage() {
  const c = CONTENT;
  return (
    <div data-tone="light" className="min-h-screen overflow-x-clip [background:var(--mk-bg)]">
      <PageHero
        badge={c.badge}
        h1a={c.h1a}
        h1b={c.h1b}
        sub={c.sub}
        actions={
          <>
            <Button size="lg" variant="primary" asChild>
              <Link href={p("/signup")}>
                {UI_STRINGS.startFree} <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={p("/superbrain")}>{UI_STRINGS.watchDemo}</Link>
            </Button>
          </>
        }
      />

      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.channelsTitle} tone="light" />
          <StaggerContainer className="grid gap-6 md:grid-cols-2" stagger={0.08}>
            {c.channels.map((ch) => {
              const Icon = ICON_MAP[ch.icon as keyof typeof ICON_MAP] ?? Mail;
              return (
                <StaggerItem key={ch.title}>
                  <a
                    href={ch.href}
                    className="group rounded-2xl transition-[background-color,border-color,color,box-shadow,transform,opacity] motion-reduce:transition-none"
                  >
                    <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--brand-primary)] hover:shadow-xl motion-reduce:transition-none">
                      <IconTile icon={Icon} />
                      <h3 className={`mb-1 ${H3_CLASS}`}>{ch.title}</h3>
                      <p className="brand-text mb-2 font-mono text-sm">{ch.value}</p>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
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
                const subject = `Kontaktanfrage — ${name}${firm ? ` (${firm})` : ""}`;
                const body = [
                  `Name: ${name}`,
                  `E-Mail: ${email}`,
                  firm && `Kanzlei: ${firm}`,
                  "",
                  message,
                ]
                  .filter(Boolean)
                  .join("\n");
                window.location.href = `mailto:hello@subsum.io?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              }}
            >
              <div className="grid gap-6 sm:grid-cols-2">
                <input
                  type="text"
                  name="name"
                  placeholder={c.formName}
                  aria-label={c.formName}
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border [border-color:var(--mk-control-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--mk-focus-ring)] focus:ring-2 focus:ring-[var(--mk-focus-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
                />
                <input
                  type="email"
                  name="email"
                  placeholder={c.formEmail}
                  aria-label={c.formEmail}
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border [border-color:var(--mk-control-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--mk-focus-ring)] focus:ring-2 focus:ring-[var(--mk-focus-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
                />
              </div>
              <input
                type="text"
                name="firm"
                placeholder={c.formFirm}
                aria-label={c.formFirm}
                autoComplete="organization"
                className="w-full rounded-xl border [border-color:var(--mk-control-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--mk-focus-ring)] focus:ring-2 focus:ring-[var(--mk-focus-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
              />
              <textarea
                name="message"
                placeholder={c.formMessage}
                aria-label={c.formMessage}
                required
                rows={5}
                className="w-full rounded-xl border [border-color:var(--mk-control-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--mk-focus-ring)] focus:ring-2 focus:ring-[var(--mk-focus-ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 motion-reduce:transition-none"
              />
              <div className="flex items-center justify-between gap-6">
                <p className="text-sm [color:var(--mk-text-subtle)]">{c.formNote}</p>
                <Button
                  type="submit"
                  size="lg"
                  variant="primary"
                  className="group min-h-[48px] shrink-0"
                >
                  {c.formSubmit}
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
                  />
                </Button>
              </div>
            </form>
          </Reveal>
        </div>
      </Section>

      <CTASection
        title={c.ctaTitle}
        sub={c.ctaSub}
        href={p("/signup")}
        label={c.ctaButton}
        secondaryHref={p("/superbrain")}
        secondaryLabel={UI_STRINGS.watchDemo}
      />
    </div>
  );
}
