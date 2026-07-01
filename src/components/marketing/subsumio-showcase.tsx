"use client";

// Subsumio premium showcase — the agency-level presentation of the law-firm
// product: a WhatsApp-Copilot spotlight (an optional convenience channel) and a
// bento-style feature grid that surfaces every capability without a flat wall of cards.
// Content is sourced from VERTICALS[lang].legal so copy stays single-source +
// SEO-indexable; this file owns only the presentation + motion.

import { motion, useReducedMotion } from "framer-motion";
import {
  Paperclip,
  Mic,
  Clock,
  Check,
  CheckCheck,
  FileText,
  ArrowLeft,
  Video,
  Phone,
  MoreVertical,
  Camera,
  Smile,
} from "lucide-react";
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
  const WA = {
    bg: "#0b141a",
    header: "#1f2c34",
    incoming: "#1f2c34",
    outgoing: "#005c4b",
    text: "#e9edef",
    meta: "#8696a0",
    read: "#53a9c6",
    accent: "#25d366",
    input: "#1f2c34",
    inputField: "#2a3b45",
  } as const;

  const chat = c.chat.slice(0, 4);
  const times = ["14:02", "14:02", "14:03", "14:04"];

  return (
    <div className="relative mx-auto w-[290px] sm:w-[330px]" aria-hidden="true">
      {/* iPhone frame */}
      <div className="relative overflow-hidden rounded-[3rem] border-[3px] border-[#2a2a2e] bg-[#0f0f12] p-[6px] shadow-[0_0_0_1px_#000,0_30px_70px_rgba(0,0,0,0.55)]">
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 z-30 h-[25px] w-[90px] -translate-x-1/2 rounded-full bg-black">
          <div className="absolute top-1/2 right-2.5 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#1a1a1e]" />
        </div>

        {/* Screen */}
        <div className="relative overflow-hidden rounded-[2.4rem] bg-[#0b141a]">
          {/* WhatsApp chat background pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h300v300H0z' fill='none'/%3E%3Cpath d='M42 42c12 0 12-18 24-18s12 18 24 18c12 0 12-18 24-18s12 18 24 18' stroke='%23fff' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
              backgroundColor: WA.bg,
              backgroundSize: "300px 300px",
            }}
          />

          {/* WhatsApp header */}
          <div className="relative z-10 flex items-center gap-2.5 bg-[#1f2c34] px-3 pt-10 pb-2.5">
            <ArrowLeft size={20} style={{ color: WA.text }} />
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#2a3b45]">
              <div className="absolute inset-0 flex items-center justify-center">
                <SubsumioMark size={16} className="text-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold" style={{ color: WA.text }}>
                {c.phoneHeader}
              </p>
              <p className="text-[11px]" style={{ color: WA.accent }}>
                {c.phoneStatus}
              </p>
            </div>
            <div className="flex items-center gap-4" style={{ color: WA.text }}>
              <Video size={18} />
              <Phone size={17} />
              <MoreVertical size={18} />
            </div>
          </div>

          {/* Messages */}
          <div className="relative z-10 min-h-[340px] space-y-2 px-3 py-3">
            {chat.map((m, i) => {
              const isUser = m.from === "user";
              return (
                <div key={i}>
                  {/* WhatsApp day separator after the confirmation message */}
                  {i === 2 && (
                    <div className="mb-4 flex justify-center">
                      <span
                        className="rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{ background: "#1e2a31", color: WA.meta }}
                      >
                        {lang === "en" ? "Today" : "Heute"}
                      </span>
                    </div>
                  )}

                  <div className={isUser ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className="relative max-w-[86%] px-2.5 pt-1.5 pb-1 text-[13px] leading-[1.35]"
                      style={{
                        background: isUser ? WA.outgoing : WA.incoming,
                        color: WA.text,
                        borderRadius: isUser ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                        boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
                      }}
                    >
                      {/* WhatsApp-style curved message tail */}
                      <span
                        className="absolute bottom-0 h-3.5 w-2"
                        style={{ [isUser ? "right" : "left"]: "-5px" }}
                      >
                        <svg
                          className="h-full w-full"
                          viewBox="0 0 8 13"
                          fill={isUser ? WA.outgoing : WA.incoming}
                          preserveAspectRatio="none"
                        >
                          <path
                            d={isUser ? "M0 0C0 7 3.5 11 8 13L0 13Z" : "M8 0C8 7 4.5 11 0 13L8 13Z"}
                          />
                        </svg>
                      </span>
                      <div className="pr-12">
                        {m.text}

                        {"file" in m && m.file && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#2a3b45]">
                              <FileText size={16} style={{ color: WA.accent }} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium">{m.file}</p>
                              <p className="text-[10px]" style={{ color: WA.meta }}>
                                PDF · 1.2 MB
                              </p>
                            </div>
                          </div>
                        )}

                        {"chips" in m && m.chips && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {m.chips.map((ch, idx) => (
                              <span
                                key={ch}
                                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                                style={{
                                  background: idx === 0 ? WA.accent : "transparent",
                                  color: idx === 0 ? "#0b0f1a" : WA.text,
                                  border: idx === 0 ? "none" : `1px solid ${WA.meta}40`,
                                }}
                              >
                                {ch}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* timestamp + read receipts */}
                      <div className="absolute right-1.5 bottom-0.5 flex items-center gap-0.5">
                        <span className="text-[10px]" style={{ color: WA.meta }}>
                          {times[i]}
                        </span>
                        {isUser && <CheckCheck size={11} style={{ color: WA.read }} />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* WhatsApp input bar */}
          <div className="relative z-10 flex items-center gap-2 bg-[#1f2c34] px-2 py-2">
            <div
              className="flex flex-1 items-center gap-2 rounded-full px-3 py-1.5"
              style={{ background: WA.inputField }}
            >
              <Smile size={20} style={{ color: WA.meta }} />
              <span className="flex-1 text-[13px]" style={{ color: WA.meta }}>
                {lang === "en" ? "Message" : "Nachricht"}
              </span>
              <Paperclip size={18} style={{ color: WA.meta }} />
              <Camera size={18} style={{ color: WA.meta }} />
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: WA.accent }}
            >
              <Mic size={18} className="text-[#0b0f1a]" />
            </div>
          </div>
        </div>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-1.5 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-white/20" />
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
