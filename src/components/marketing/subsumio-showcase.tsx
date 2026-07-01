"use client";

// Subsumio premium showcase — the agency-level presentation of the law-firm
// product: a WhatsApp-Copilot spotlight (an optional convenience channel) and a
// bento-style feature grid that surfaces every capability without a flat wall of cards.
// Content is sourced from VERTICALS[lang].legal so copy stays single-source +
// SEO-indexable; this file owns only the presentation + motion.

import { motion, useReducedMotion } from "framer-motion";
import { Paperclip, Mic, Clock, Check, FileText } from "lucide-react";
import { ICONS, Section, accentTile } from "./chrome";
import { VERTICALS } from "@/content/verticals";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import type { Lang } from "@/content/site";

const _deShowcase = {
  waEyebrow: "Komfort-Kanal für unterwegs",
  waTitle: "Subsumio-Copilot — direkt in WhatsApp",
  waSub:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
  waPoints: [
    {
      icon: Clock,
      color: "emerald",
      t: "Zeit & Auslagen in Sekunden",
      d: '"Zeit 0,5h Akte Müller, Telefonat" → erfasst, der Akte zugeordnet, ein Tipp zum Bestätigen.',
    },
    {
      icon: Paperclip,
      color: "amber",
      t: "Beleg-Foto → richtige Akte",
      d: "Dokument oder Foto mit Akten-Kürzel in der Caption landet revisionssicher im Vault.",
    },
    {
      icon: Mic,
      color: "violet",
      t: "Sprachnotiz unterwegs",
      d: "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor du im Büro bist.",
    },
  ],
  phoneHeader: "Subsumio-Copilot",
  phoneStatus: "online",
  chat: [
    { from: "user", text: "Zeit 0,5h Akte Müller, Telefonat Gegenseite" },
    {
      from: "bot",
      text: "✓ Zeitbuchung 0,5 h · Akte Müller · Telefonat\nBestätigen?",
      chips: ["Bestätigen", "Ändern"],
    },
    {
      from: "user",
      text: "Frage: Wo widersprechen sich die Aussagen der Gegenseite?",
      file: "Schriftsatz_Gegenseite.pdf",
    },
    {
      from: "bot",
      text: "3 Widersprüche gefunden — mit Fundstellen (S. 14, B7, Protokoll K.). Antwort in der Akte abgelegt.",
    },
  ],
  bentoEyebrow: "Alle Funktionen",
  bentoTitle: "Alles, was die Kanzlei braucht — in einem Gehirn",
  bentoSub:
    "Self-hosted oder EU-Cloud. Jede Antwort mit Fundstelle. Jede Funktion auf deiner Infrastruktur.",
} as const;

const COPY = {
  de: _deShowcase,
  at: _deShowcase,
  ch: _deShowcase,
  en: {
    waEyebrow: "Convenience on the go",
    waTitle: "Subsumio Copilot — right inside WhatsApp",
    waSub:
      "Book time, file documents, query matters — from your phone, no app switch, no training. The copilot understands the matter and files everything for confirmation in the brain.",
    waPoints: [
      {
        icon: Clock,
        color: "emerald",
        t: "Time & expenses in seconds",
        d: '"Time 0.5h matter Müller, call" → captured, linked to the matter, one tap to confirm.',
      },
      {
        icon: Paperclip,
        color: "amber",
        t: "Receipt photo → right matter",
        d: "A document or photo with the case reference in the caption lands in the vault, audit-ready.",
      },
      {
        icon: Mic,
        color: "violet",
        t: "Voice note on the go",
        d: "Dictate after the hearing — transcribed and attached to the matter before you're back at the office.",
      },
    ],
    phoneHeader: "Subsumio Copilot",
    phoneStatus: "online",
    chat: [
      { from: "user", text: "Time 0.5h matter Müller, opposing-counsel call" },
      {
        from: "bot",
        text: "✓ Time entry 0.5 h · matter Müller · call\nConfirm?",
        chips: ["Confirm", "Edit"],
      },
      {
        from: "user",
        text: "Ask: where do the opposing party's statements contradict?",
        file: "Opposing_Brief.pdf",
      },
      {
        from: "bot",
        text: "3 contradictions found — with sources (p. 14, B7, protocol K.). Answer filed in the matter.",
      },
    ],
    bentoEyebrow: "All capabilities",
    bentoTitle: "Everything a firm needs — in one brain",
    bentoSub:
      "Self-hosted or EU cloud. Every answer cited. Every feature on your own infrastructure.",
  },
} as const;

const reveal = (i: number, reduce = false) => ({
  initial: reduce ? false : { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: {
    duration: 0.5,
    delay: Math.min(i * 0.06, 0.4),
    ease: [0.21, 0.5, 0.27, 1] as const,
  },
});

export function PhoneCopilot({ lang }: { lang: Lang }) {
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  return (
    // Always-dark device mock: pin data-tone="dark" so --mk-* inside resolves
    // dark even when the phone sits on a light page. Marked decorative because
    // the same value props are already spelled out in the left-column copy.
    <div data-tone="dark" className="relative mx-auto w-[280px] sm:w-[320px]" aria-hidden="true">
      {/* device frame */}
      <div className="relative rounded-[2.5rem] border border-[var(--mk-border-strong)] bg-[var(--mk-surface)] p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_25px_60px_rgba(0,0,0,0.5)]">
        {/* dynamic island */}
        <div className="absolute top-4 left-1/2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
        {/* screen */}
        <div className="relative overflow-hidden rounded-[2.1rem] border border-[var(--mk-border)] bg-[var(--mk-bg)]">
          {/* header */}
          <div className="flex items-center gap-3 border-b border-[var(--mk-border)] bg-[var(--mk-surface)] px-4 py-3 pt-6">
            <div className="brand-bg flex h-8 w-8 items-center justify-center rounded-full">
              <SubsumioMark size={14} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold [color:var(--mk-text)]">{c.phoneHeader}</p>
              <p className="flex items-center gap-1 text-xs [color:var(--brand-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--signal-green)]" />
                {c.phoneStatus}
              </p>
            </div>
          </div>
          {/* messages — static, like a polished product screenshot */}
          <div className="min-h-[340px] space-y-3 bg-[var(--mk-bg)] px-3 py-4">
            {c.chat.map((m, i) => (
              <div
                key={i}
                className={m.from === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-snug whitespace-pre-line shadow-sm ${
                    m.from === "user"
                      ? "rounded-br-sm bg-[var(--signal-green)] text-[#0b0f1a]"
                      : "rounded-bl-sm border border-[var(--mk-border-strong)] bg-[var(--mk-surface)] text-[var(--mk-text)]"
                  }`}
                >
                  {m.text}
                  {"file" in m && m.file && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#0b0f1a]/10 px-2 py-1 text-[10px] font-medium text-[#0b0f1a]/80">
                      <FileText size={10} /> {m.file}
                    </span>
                  )}
                  {"chips" in m && m.chips && (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {m.chips.map((ch, idx) => (
                        <span
                          key={ch}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                            idx === 0
                              ? "bg-[var(--mk-text)] text-[var(--mk-bg)]"
                              : "border border-[var(--mk-border-strong)] text-[var(--mk-text-muted)]"
                          }`}
                        >
                          {ch}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** WhatsApp-Copilot spotlight — an optional convenience channel. Always a DARK spotlight band
 *  (pins data-tone="dark"); reused on the homepage teaser and the /whatsapp
 *  deep-dive page. */
export function WhatsAppSpotlight({ lang, children }: { lang: Lang; children?: React.ReactNode }) {
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  const reduce = useReducedMotion() ?? false;

  return (
    <Section
      tone="dark"
      className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8"
      aria-label="WhatsApp Copilot"
    >
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <motion.div {...reveal(0, reduce)}>
            <span className="brand-text brand-soft brand-border mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
              {c.waEyebrow}
            </span>
          </motion.div>
          <motion.div {...reveal(1, reduce)}>
            <h2 className="mb-4 [font-family:var(--font-display)] text-3xl leading-[1.1] font-black tracking-[-0.02em] text-balance [color:var(--mk-text)] md:text-4xl lg:text-5xl">
              {c.waTitle}
            </h2>
          </motion.div>
          <motion.div {...reveal(2, reduce)}>
            <p className="mb-10 max-w-xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg">
              {c.waSub}
            </p>
          </motion.div>
          <ul className="space-y-5">
            {c.waPoints.map((pt, i) => {
              const Icon = pt.icon;
              return (
                <motion.li key={pt.t} {...reveal(i + 3, reduce)} className="flex items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accentTile(pt.color, "dark")}`}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="text-base font-semibold [color:var(--mk-text)]">{pt.t}</p>
                    <p className="mt-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {pt.d}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
          {children && <motion.div {...reveal(6, reduce)}>{children}</motion.div>}
        </div>
        <motion.div {...reveal(2, reduce)} className="relative">
          <PhoneCopilot lang={lang} />
        </motion.div>
      </div>
    </Section>
  );
}

/** Bento feature grid — every capability. Tone-flexible: inherits the
 *  surrounding section tone (place inside a <Section tone=…>). */
export function FeatureBento({ lang }: { lang: Lang }) {
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  const features = VERTICALS[lang].legal.features;
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div {...reveal(0, reduce)} className="mb-14 text-center">
        <span className="brand-soft brand-text brand-border mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium">
          {c.bentoEyebrow}
        </span>
        <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-4xl">
          {c.bentoTitle}
        </h2>
        <p className="mx-auto max-w-2xl text-lg [color:var(--mk-text-muted)]">{c.bentoSub}</p>
      </motion.div>
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => {
          const Icon = ICONS[f.icon];
          const featured = i === 0 || i === 4; // two emphasis tiles
          return (
            <motion.div
              key={f.title}
              {...reveal(i, reduce)}
              whileHover={reduce ? undefined : { y: -4 }}
              className={`group relative overflow-hidden rounded-2xl border p-6 transition-colors duration-300 [background:var(--mk-surface)] ${featured ? "brand-border sm:col-span-2" : "[border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)]"}`}
            >
              {featured && (
                <div
                  className="absolute -top-12 -right-12 h-40 w-40 rounded-full opacity-30 blur-2xl"
                  style={{
                    background: "radial-gradient(circle, var(--brand-glow), transparent 70%)",
                  }}
                />
              )}
              <div className="relative">
                <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                  {Icon && <Icon size={19} className="brand-text" />}
                </div>
                <h3 className="mb-2 flex items-center gap-2 text-base font-semibold [color:var(--mk-text)]">
                  {f.title}
                  {featured && <Check size={14} className="brand-text" />}
                </h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{f.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default function SubsumioShowcase({ lang }: { lang: Lang }) {
  return (
    <>
      <WhatsAppSpotlight lang={lang} />
      <FeatureBento lang={lang} />
    </>
  );
}
