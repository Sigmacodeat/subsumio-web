"use client";

// Subsumio premium showcase — the agency-level presentation of the law-firm
// product: a WhatsApp-Copilot spotlight (an optional convenience channel) and a
// bento-style feature grid that surfaces every capability without a flat wall of cards.
// Content is sourced from VERTICALS[lang].legal so copy stays single-source +
// SEO-indexable; this file owns only the presentation + motion.

import { motion, useReducedMotion } from "framer-motion";
import { Paperclip, Mic, Clock, Check, FileText, ShieldCheck } from "lucide-react";
import { ICONS } from "./chrome";
import { VERTICALS } from "@/content/verticals";
import type { Lang } from "@/content/site";

const _deShowcase = {
  waEyebrow: "Komfort-Kanal für unterwegs",
  waTitle: "Subsumio-Copilot — direkt in WhatsApp",
  waSub:
    "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
  waPoints: [
    {
      icon: Clock,
      t: "Zeit & Auslagen in Sekunden",
      d: '"Zeit 0,5h Akte Müller, Telefonat" → erfasst, der Akte zugeordnet, ein Tipp zum Bestätigen.',
    },
    {
      icon: Paperclip,
      t: "Beleg-Foto → richtige Akte",
      d: "Dokument oder Foto mit Akten-Kürzel in der Caption landet revisionssicher im Vault.",
    },
    {
      icon: Mic,
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
        t: "Time & expenses in seconds",
        d: '"Time 0.5h matter Müller, call" → captured, linked to the matter, one tap to confirm.',
      },
      {
        icon: Paperclip,
        t: "Receipt photo → right matter",
        d: "A document or photo with the case reference in the caption lands in the vault, audit-ready.",
      },
      {
        icon: Mic,
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

const reveal = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: {
    duration: 0.5,
    delay: Math.min(i * 0.06, 0.4),
    ease: [0.21, 0.5, 0.27, 1] as const,
  },
});

export function PhoneCopilot({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  return (
    // Always-dark device mock: pin data-tone="dark" so --mk-* inside resolves
    // dark even when the phone sits on a light page.
    <div data-tone="dark" className="relative mx-auto w-[300px]">
      {/* glow behind the phone */}
      <div
        className="absolute -inset-6 rounded-[3rem] opacity-40 blur-2xl"
        style={{ background: "radial-gradient(circle, var(--brand-glow), transparent 70%)" }}
      />
      <div className="relative rounded-[2.5rem] border [border-color:var(--mk-border-strong)] p-2.5 shadow-2xl shadow-black/60 [background:var(--mk-bg)]">
        <div className="overflow-hidden rounded-[2rem] border [border-color:var(--mk-border)] [background:var(--mk-surface-2)]">
          {/* header */}
          <div
            className="flex items-center gap-2.5 border-b [border-color:var(--mk-border)] px-4 py-3"
            style={{ background: "linear-gradient(120deg, var(--mk-surface), var(--mk-bg))" }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{
                background:
                  "linear-gradient(150deg, var(--brand-gradient-via), var(--brand-gradient-to))",
              }}
            >
              <ShieldCheck size={15} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold [color:var(--mk-text)]">{c.phoneHeader}</p>
              <p className="flex items-center gap-1 text-xs text-[var(--brand-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
                {c.phoneStatus}
              </p>
            </div>
          </div>
          {/* messages */}
          <div
            className="min-h-[360px] space-y-2.5 px-3 py-4"
            style={{
              background:
                "repeating-linear-gradient(135deg, var(--mk-surface-2), var(--mk-surface-2) 18px, var(--mk-surface) 18px, var(--mk-surface) 36px)",
            }}
          >
            {c.chat.map((m, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: reduce ? 0 : 0.5 + i * 0.7 }}
                className={m.from === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-snug whitespace-pre-line ${m.from === "user" ? "rounded-br-sm bg-emerald-500/15 text-emerald-300" : "rounded-bl-sm border [border-color:var(--mk-border-strong)] bg-blue-500/10 text-blue-200"}`}
                >
                  {m.text}
                  {"file" in m && m.file && (
                    <span className="mt-1.5 flex items-center gap-1 text-xs text-sky-300">
                      <FileText size={11} /> {m.file}
                    </span>
                  )}
                  {"chips" in m && m.chips && (
                    <span className="mt-2 flex gap-1.5">
                      {m.chips.map((ch) => (
                        <span
                          key={ch}
                          className={`rounded-full border px-2 py-0.5 text-xs ${ch === m.chips![0] ? "border-[var(--brand-secondary)]/40 bg-[var(--brand-secondary)]/10 text-[var(--brand-secondary)]" : "[border-color:var(--mk-border-strong)] [color:var(--mk-text-muted)]"}`}
                        >
                          {ch}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </motion.div>
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

  return (
    <section
      data-tone="dark"
      className="relative z-10 overflow-hidden px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "linear-gradient(180deg, rgba(13,25,45,0.35), var(--mk-bg))" }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
        <motion.div {...reveal(0)}>
          <span className="brand-text brand-soft brand-border mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" /> {c.waEyebrow}
          </span>
          <h2 className="mb-4 text-3xl leading-tight font-black [color:var(--mk-text)] md:text-4xl">
            {c.waTitle}
          </h2>
          <p className="mb-8 max-w-lg text-base leading-relaxed [color:var(--mk-text-muted)]">
            {c.waSub}
          </p>
          <div className="space-y-4">
            {c.waPoints.map((pt, i) => {
              const Icon = pt.icon;
              return (
                <motion.div key={pt.t} {...reveal(i + 1)} className="flex gap-3.5">
                  <div className="brand-soft brand-border flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border">
                    <Icon size={16} className="brand-text" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold [color:var(--mk-text)]">{pt.t}</p>
                    <p className="mt-0.5 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {pt.d}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
          {children}
        </motion.div>
        <motion.div {...reveal(1)}>
          <PhoneCopilot lang={lang} />
        </motion.div>
      </div>
    </section>
  );
}

/** Bento feature grid — every capability. Tone-flexible: inherits the
 *  surrounding section tone (place inside a <Section tone=…>). */
export function FeatureBento({ lang }: { lang: Lang }) {
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  const features = VERTICALS[lang].legal.features;
  return (
    <div className="relative z-10 mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
      <motion.div {...reveal(0)} className="mb-14 text-center">
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
              {...reveal(i)}
              whileHover={{ y: -4 }}
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
