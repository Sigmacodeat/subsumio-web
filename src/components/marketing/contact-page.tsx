"use client";

import { motion } from "framer-motion";
import { Mail, MessageSquare, FileText, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import {
  Section,
  SectionHeading,
} from "./chrome";

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
  de: {
    badge: "Kontakt",
    h1a: "Sprich mit unserem Team.",
    h1b: "Wir sprechen deine Sprache.",
    sub: "Fragen zu Subsumio, Self-Hosting, Enterprise-Plänen oder Partnerschaften? Erreiche uns — wir antworten innerhalb eines Werktages.",
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
  },
};

const ICON_MAP = { Mail, MessageSquare, FileText };

export default function ContactPage({ lang }: { lang: Lang }) {
  const c = CONTENT[lang];
  return (
    <>

      <Section tone="light" className="px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            className="brand-soft brand-text brand-border mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <span className="brand-bg h-1.5 w-1.5 animate-pulse rounded-full" />
            {c.badge}
          </motion.span>
          <motion.h1
            className="text-4xl font-black tracking-tight [color:var(--mk-text)] md:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            {c.h1a}
            <br />
            <span className="brand-text">{c.h1b}</span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
          >
            {c.sub}
          </motion.p>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={c.channelsTitle} tone="light" />
          <div className="grid gap-4 md:grid-cols-3">
            {c.channels.map((ch, i) => {
              const Icon = ICON_MAP[ch.icon as keyof typeof ICON_MAP] ?? Mail;
              return (
                <motion.a
                  key={ch.title}
                  href={ch.href}
                  className="group rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all [background:var(--mk-surface)] hover:border-[var(--brand-primary)] hover:shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.45, delay: i * 0.08 }}
                >
                  <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                    <Icon size={22} className="brand-text" />
                  </div>
                  <h3 className="mb-1 text-sm font-semibold [color:var(--mk-text)]">{ch.title}</h3>
                  <p className="brand-text mb-2 font-mono text-sm">{ch.value}</p>
                  <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">{ch.desc}</p>
                </motion.a>
              );
            })}
          </div>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <SectionHeading title={c.formTitle} tone="light" />
          <motion.form
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5 }}
            onSubmit={(e) => {
              e.preventDefault();
              window.location.href = "mailto:hello@subsum.eu";
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                placeholder={c.formName}
                required
                className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
              />
              <input
                type="email"
                placeholder={c.formEmail}
                required
                className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
              />
            </div>
            <input
              type="text"
              placeholder={c.formFirm}
              className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
            />
            <textarea
              placeholder={c.formMessage}
              required
              rows={5}
              className="w-full rounded-xl border [border-color:var(--mk-border)] px-4 py-3 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs [color:var(--mk-text-subtle)]">{c.formNote}</p>
              <Button
                type="submit"
                size="lg"
                variant="glow"
                className="group min-h-[48px] shrink-0"
              >
                {c.formSubmit}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Button>
            </div>
          </motion.form>
        </div>
      </Section>

      <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="mb-4 text-3xl font-black tracking-tight [color:var(--mk-text)] md:text-4xl">
            {c.ctaTitle}
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg [color:var(--mk-text-muted)]">{c.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="lg" variant="glow" className="group min-h-[48px]">
              {c.ctaButton}
              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Button>
          </Link>
        </motion.div>
      </Section>

    </>
  );
}
