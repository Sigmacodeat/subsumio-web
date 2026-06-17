"use client";

// Light "trust" band — the serious, credibility-first counterpoint to the dark
// product sections (the light/dark mix). Cream surface, dark type, soft shadows
// (no glows), deliberate signal accents. This is the section that signals
// "trustworthy partner" rather than "tech startup" to a legal audience.

import { motion } from "framer-motion";
import { ShieldCheck, Lock, Quote, ScrollText } from "lucide-react";
import type { Lang } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { GlowCard } from "./motion-system";

const COPY = {
  de: {
    eyebrow: "Gebaut für vertrauliche Arbeit",
    title: "Seriös, sicher, nachvollziehbar",
    sub: "{brand} ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist — nicht Präferenz.",
    pillars: [
      { icon: ShieldCheck, signal: "blue", t: "Self-hosted oder EU-Cloud", d: "Eure Hardware oder EU-Hosting mit AVV. Mandantendaten verlassen die EU nicht." },
      { icon: Lock, signal: "green", t: "Kein Training auf euren Daten", d: "Euer Wissen trainiert nie geteilte Modelle. Niemals." },
      { icon: Quote, signal: "blue", t: "Jede Antwort belegt", d: "Seitengenaue Zitate — prüfbar in einem Klick, bevor etwas in den Schriftsatz geht." },
      { icon: ScrollText, signal: "amber", t: "§ 203 StGB im Blick", d: "Architektur für Berufsgeheimnisträger — kein Dritter verarbeitet Mandantendaten." },
    ],
  },
  en: {
    eyebrow: "Built for confidential work",
    title: "Serious, secure, verifiable",
    sub: "{brand} is built for professions where confidentiality is law, not preference.",
    pillars: [
      { icon: ShieldCheck, signal: "blue", t: "Self-hosted or EU cloud", d: "Your hardware or EU hosting with a DPA. Client data never leaves the EU." },
      { icon: Lock, signal: "green", t: "No training on your data", d: "Your knowledge never trains shared models. Ever." },
      { icon: Quote, signal: "blue", t: "Every answer cited", d: "Page-level citations — verify in one click before anything goes into a brief." },
      { icon: ScrollText, signal: "amber", t: "Professional secrecy by design", d: "Architecture for confidentiality holders — no third party processes client data." },
    ],
  },
} as const;

const SIGNAL: Record<string, { text: string; bg: string; ring: string }> = {
  blue: { text: "var(--signal-blue)", bg: "rgba(29,78,216,0.08)", ring: "rgba(29,78,216,0.18)" },
  green: { text: "var(--signal-green)", bg: "rgba(4,120,87,0.08)", ring: "rgba(4,120,87,0.18)" },
  amber: { text: "var(--signal-amber)", bg: "rgba(180,83,9,0.08)", ring: "rgba(180,83,9,0.18)" },
};

export default function TrustBand({ lang, industry }: { lang: Lang; industry?: string }) {
  const c = COPY[lang];
  const brand = profileForIndustry(industry)?.brand ?? "Sigmabrain";
  const sub = c.sub.replace("{brand}", brand);
  return (
    <section data-tone="light" className="relative z-10 py-28 px-6" style={{ background: "var(--mk-bg)" }}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-14"
        >
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold mb-5"
            style={{ color: "var(--signal-blue)", background: "rgba(29,78,216,0.08)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--signal-blue)" }} />
            {c.eyebrow}
          </span>
          <h2 className="text-3xl md:text-4xl font-black mb-4 [color:var(--mk-text)]">
            {c.title}
          </h2>
          <p className="text-lg max-w-2xl mx-auto [color:var(--mk-text-muted)]">
            {sub}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {c.pillars.map((pillar, i) => {
            const Icon = pillar.icon;
            const sig = SIGNAL[pillar.signal];
            return (
              <motion.div
                key={pillar.t}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              >
                <GlowCard
                  glowColor={sig.text}
                  intensity={0.12}
                  className="h-full rounded-2xl [background:var(--mk-surface)] border [border-color:var(--mk-border)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
                >
                  <div className="p-6">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: sig.bg, boxShadow: `inset 0 0 0 1px ${sig.ring}` }}
                    >
                      <Icon size={19} style={{ color: sig.text }} />
                    </div>
                    <h3 className="text-base font-bold mb-2 [color:var(--mk-text)]">
                      {pillar.t}
                    </h3>
                    <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {pillar.d}
                    </p>
                  </div>
                </GlowCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
