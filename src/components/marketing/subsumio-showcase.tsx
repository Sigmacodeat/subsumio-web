"use client";

// Subsumio premium showcase — the agency-level presentation of the law-firm
// product: a WhatsApp-Copilot spotlight (the winning USP) and a bento-style
// feature grid that surfaces every capability without a flat wall of cards.
// Content is sourced from VERTICALS[lang].legal so copy stays single-source +
// SEO-indexable; this file owns only the presentation + motion.

import { motion, useReducedMotion } from "framer-motion";
import { Paperclip, Mic, Clock, Check, FileText, ShieldCheck } from "lucide-react";
import { ICONS } from "./chrome";
import { VERTICALS } from "@/content/verticals";
import type { Lang } from "@/content/site";

const COPY = {
  de: {
    waEyebrow: "Der Winning USP",
    waTitle: "Subsumio-Copilot — direkt in WhatsApp",
    waSub: "Zeit buchen, Belege ablegen, Akten befragen — vom Handy, ohne App-Wechsel, ohne Schulung. Der Copilot versteht die Akte und legt alles bestätigungspflichtig ins Brain.",
    waPoints: [
      { icon: Clock, t: "Zeit & Auslagen in Sekunden", d: "\"Zeit 0,5h Akte Müller, Telefonat\" → erfasst, der Akte zugeordnet, ein Tipp zum Bestätigen." },
      { icon: Paperclip, t: "Beleg-Foto → richtige Akte", d: "Dokument oder Foto mit Akten-Kürzel in der Caption landet revisionssicher im Vault." },
      { icon: Mic, t: "Sprachnotiz unterwegs", d: "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor du im Büro bist." },
    ],
    phoneHeader: "Subsumio-Copilot",
    phoneStatus: "online",
    chat: [
      { from: "user", text: "Zeit 0,5h Akte Müller, Telefonat Gegenseite" },
      { from: "bot", text: "✓ Zeitbuchung 0,5 h · Akte Müller · Telefonat\nBestätigen?", chips: ["Bestätigen", "Ändern"] },
      { from: "user", text: "Frage: Wo widersprechen sich die Aussagen der Gegenseite?", file: "Schriftsatz_Gegenseite.pdf" },
      { from: "bot", text: "3 Widersprüche gefunden — mit Fundstellen (S. 14, B7, Protokoll K.). Antwort in der Akte abgelegt." },
    ],
    bentoEyebrow: "Alle Funktionen",
    bentoTitle: "Alles, was die Kanzlei braucht — in einem Gehirn",
    bentoSub: "Self-hosted oder EU-Cloud. Jede Antwort mit Fundstelle. Jede Funktion auf eurer Infrastruktur.",
  },
  en: {
    waEyebrow: "The winning USP",
    waTitle: "Subsumio Copilot — right inside WhatsApp",
    waSub: "Book time, file documents, query matters — from your phone, no app switch, no training. The copilot understands the matter and files everything for confirmation in the brain.",
    waPoints: [
      { icon: Clock, t: "Time & expenses in seconds", d: "\"Time 0.5h matter Müller, call\" → captured, linked to the matter, one tap to confirm." },
      { icon: Paperclip, t: "Receipt photo → right matter", d: "A document or photo with the case reference in the caption lands in the vault, audit-ready." },
      { icon: Mic, t: "Voice note on the go", d: "Dictate after the hearing — transcribed and attached to the matter before you're back at the office." },
    ],
    phoneHeader: "Subsumio Copilot",
    phoneStatus: "online",
    chat: [
      { from: "user", text: "Time 0.5h matter Müller, opposing-counsel call" },
      { from: "bot", text: "✓ Time entry 0.5 h · matter Müller · call\nConfirm?", chips: ["Confirm", "Edit"] },
      { from: "user", text: "Ask: where do the opposing party's statements contradict?", file: "Opposing_Brief.pdf" },
      { from: "bot", text: "3 contradictions found — with sources (p. 14, B7, protocol K.). Answer filed in the matter." },
    ],
    bentoEyebrow: "All capabilities",
    bentoTitle: "Everything a firm needs — in one brain",
    bentoSub: "Self-hosted or EU cloud. Every answer cited. Every feature on your own infrastructure.",
  },
} as const;

const reveal = (i: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, delay: Math.min(i * 0.06, 0.4), ease: [0.21, 0.5, 0.27, 1] as const },
});

export function PhoneCopilot({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const c = COPY[lang];
  return (
    // Always-dark device mock: pin data-tone="dark" so --mk-* inside resolves
    // dark even when the phone sits on a light page.
    <div data-tone="dark" className="relative mx-auto w-[300px]">
      {/* glow behind the phone */}
      <div className="absolute -inset-6 rounded-[3rem] blur-2xl opacity-40" style={{ background: "radial-gradient(circle, var(--brand-glow), transparent 70%)" }} />
      <div className="relative rounded-[2.5rem] border border-[#23233f] bg-[#0a0a14] p-2.5 shadow-2xl shadow-black/60">
        <div className="rounded-[2rem] overflow-hidden border border-[#1a1a30] bg-[#0b0f1a]">
          {/* header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#15233a]" style={{ background: "linear-gradient(120deg,#0e1d33,#0b1424)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(150deg,#1d4ed8,#0ea5e9)" }}>
              <ShieldCheck size={15} className="text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold [color:var(--mk-text)]">{c.phoneHeader}</p>
              <p className="text-[10px] text-[var(--brand-secondary)] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)]" />{c.phoneStatus}</p>
            </div>
          </div>
          {/* messages */}
          <div className="px-3 py-4 space-y-2.5 min-h-[360px]" style={{ background: "repeating-linear-gradient(135deg,#0b0f1a,#0b0f1a 18px,#0c1120 18px,#0c1120 36px)" }}>
            {c.chat.map((m, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: reduce ? 0 : 0.5 + i * 0.7 }}
                className={m.from === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[11px] leading-snug whitespace-pre-line ${m.from === "user" ? "rounded-br-sm bg-[#13351f] text-[#d6f5e1]" : "rounded-bl-sm bg-[#13213a] text-[#cfe0f5] border border-[#1d3354]"}`}>
                  {m.text}
                  {"file" in m && m.file && (
                    <span className="mt-1.5 flex items-center gap-1 text-[10px] text-sky-300"><FileText size={11} /> {m.file}</span>
                  )}
                  {"chips" in m && m.chips && (
                    <span className="mt-2 flex gap-1.5">
                      {m.chips.map((ch) => (
                        <span key={ch} className={`text-[10px] px-2 py-0.5 rounded-full border ${ch === m.chips![0] ? "border-[var(--brand-secondary)]/40 text-[var(--brand-secondary)] bg-[var(--brand-secondary)]/10" : "[border-color:var(--mk-border-strong)] text-[#8fa6c5]"}`}>{ch}</span>
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

/** WhatsApp-Copilot spotlight — the winning USP. Always a DARK spotlight band
 *  (pins data-tone="dark"); reused on the homepage teaser and the /whatsapp
 *  deep-dive page. */
export function WhatsAppSpotlight({ lang, children }: { lang: Lang; children?: React.ReactNode }) {
  const c = COPY[lang];

  return (
    <section data-tone="dark" className="relative z-10 py-28 px-6 border-y [border-color:var(--mk-border)] overflow-hidden" style={{ background: "linear-gradient(180deg, rgba(13,25,45,0.35), var(--mk-bg))" }}>
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
        <motion.div {...reveal(0)}>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold brand-text brand-soft border brand-border mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-pulse" /> {c.waEyebrow}
          </span>
          <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4 leading-tight">{c.waTitle}</h2>
          <p className="text-base [color:var(--mk-text-muted)] leading-relaxed mb-8 max-w-lg">{c.waSub}</p>
          <div className="space-y-4">
            {c.waPoints.map((pt, i) => {
              const Icon = pt.icon;
              return (
                <motion.div key={pt.t} {...reveal(i + 1)} className="flex gap-3.5">
                  <div className="w-9 h-9 rounded-xl brand-soft border brand-border flex items-center justify-center shrink-0">
                    <Icon size={16} className="brand-text" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold [color:var(--mk-text)]">{pt.t}</p>
                    <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed mt-0.5">{pt.d}</p>
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
  const c = COPY[lang];
  const features = VERTICALS[lang].legal.features;
  return (
    <div className="relative z-10 py-28 px-6 max-w-6xl mx-auto">
      <motion.div {...reveal(0)} className="text-center mb-14">
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium brand-soft brand-text border brand-border mb-4">{c.bentoEyebrow}</span>
        <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{c.bentoTitle}</h2>
        <p className="text-lg [color:var(--mk-text-muted)] max-w-2xl mx-auto">{c.bentoSub}</p>
      </motion.div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
        {features.map((f, i) => {
          const Icon = ICONS[f.icon];
          const featured = i === 0 || i === 4; // two emphasis tiles
          return (
            <motion.div
              key={f.title}
              {...reveal(i)}
              whileHover={{ y: -4 }}
              className={`group relative p-6 rounded-2xl border [background:var(--mk-surface)] overflow-hidden transition-colors duration-300 ${featured ? "sm:col-span-2 brand-border" : "[border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)]"}`}
            >
              {featured && (
                <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full blur-2xl opacity-30" style={{ background: "radial-gradient(circle, var(--brand-glow), transparent 70%)" }} />
              )}
              <div className="relative">
                <div className="w-11 h-11 rounded-xl brand-soft border brand-border flex items-center justify-center mb-4">
                  {Icon && <Icon size={19} className="brand-text" />}
                </div>
                <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2 flex items-center gap-2">
                  {f.title}
                  {featured && <Check size={14} className="brand-text" />}
                </h3>
                <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{f.desc}</p>
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
