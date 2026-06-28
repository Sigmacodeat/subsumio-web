"use client";

// Light "trust" band — the serious, credibility-first counterpoint to the dark
// product sections (the light/dark mix). Cream surface, dark type, soft shadows
// (no glows), deliberate signal accents. This is the section that signals
// "trustworthy partner" rather than "tech startup" to a legal audience.

import { motion } from "framer-motion";
import { ShieldCheck, Lock, Quote, ScrollText } from "lucide-react";
import type { Lang } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { GlowCard, EASE } from "./motion-system";

const _deTrustCopy = {
  eyebrow: "Gebaut für vertrauliche Arbeit",
  title: "Seriös, sicher, nachvollziehbar",
  sub: "{brand} ist für Berufe gebaut, in denen Verschwiegenheit Gesetz ist — nicht Präferenz.",
  pillars: [
    {
      icon: ShieldCheck,
      signal: "blue",
      t: "Self-hosted oder EU-Cloud",
      d: "Deine Hardware oder EU-Hosting mit AVV. Mandantendaten verlassen die EU nicht.",
    },
    {
      icon: Lock,
      signal: "green",
      t: "Kein Training auf deinen Daten",
      d: "Dein Wissen trainiert nie geteilte Modelle. Niemals.",
    },
    {
      icon: Quote,
      signal: "blue",
      t: "Jede Antwort belegt",
      d: "Seitengenaue Zitate — prüfbar in einem Klick, bevor etwas in den Schriftsatz geht.",
    },
    {
      icon: ScrollText,
      signal: "amber",
      t: "§ 203 StGB im Blick",
      d: "Architektur für Berufsgeheimnisträger — kein Dritter verarbeitet Mandantendaten.",
    },
  ],
} as const;

const COPY = {
  de: _deTrustCopy,
  at: _deTrustCopy,
  ch: _deTrustCopy,
  en: {
    eyebrow: "Built for confidential work",
    title: "Serious, secure, verifiable",
    sub: "{brand} is built for professions where confidentiality is law, not preference.",
    pillars: [
      {
        icon: ShieldCheck,
        signal: "blue",
        t: "Self-hosted or EU cloud",
        d: "Your hardware or EU hosting with a DPA. Client data never leaves the EU.",
      },
      {
        icon: Lock,
        signal: "green",
        t: "No training on your data",
        d: "Your knowledge never trains shared models. Ever.",
      },
      {
        icon: Quote,
        signal: "blue",
        t: "Every answer cited",
        d: "Page-level citations — verify in one click before anything goes into a brief.",
      },
      {
        icon: ScrollText,
        signal: "amber",
        t: "Professional secrecy by design",
        d: "Architecture for confidentiality holders — no third party processes client data.",
      },
    ],
  },
} as const;

const SIGNAL: Record<string, { text: string; bg: string; ring: string }> = {
  blue: { text: "#60a5fa", bg: "rgba(96,165,250,0.10)", ring: "rgba(96,165,250,0.20)" },
  green: { text: "#34d399", bg: "rgba(52,211,153,0.10)", ring: "rgba(52,211,153,0.20)" },
  amber: { text: "#fbbf24", bg: "rgba(251,191,36,0.10)", ring: "rgba(251,191,36,0.20)" },
};

export default function TrustBand({ lang, industry }: { lang: Lang; industry?: string }) {
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  const brand = profileForIndustry(industry)?.brand ?? "Subsumio";
  const sub = c.sub.replace("{brand}", brand);
  return (
    <section
      data-tone="slate"
      className="relative z-10 px-4 py-28 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <span
            className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ color: "#60a5fa", background: "rgba(96,165,250,0.10)" }}
          >
            <span
              className="badge-pulse h-1.5 w-1.5 rounded-full"
              style={{ background: "#60a5fa" }}
            />
            {c.eyebrow}
          </span>
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">{c.title}</h2>
          <p className="mx-auto max-w-2xl text-lg [color:var(--mk-text-muted)]">{sub}</p>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {c.pillars.map((pillar, i) => {
            const Icon = pillar.icon;
            const sig = SIGNAL[pillar.signal];
            return (
              <motion.div
                key={pillar.t}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.09, ease: EASE.out }}
              >
                <GlowCard
                  glowColor={sig.text}
                  intensity={0.12}
                  className="h-full rounded-2xl border [border-color:var(--mk-border)] transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-lg"
                  style={{ boxShadow: "var(--mk-card-shadow)" } as React.CSSProperties}
                >
                  <div className="p-6">
                    <div
                      className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: sig.bg, boxShadow: `inset 0 0 0 1px ${sig.ring}` }}
                    >
                      <Icon size={19} style={{ color: sig.text }} />
                    </div>
                    <h3 className="mb-2 text-base font-bold [color:var(--mk-text)]">{pillar.t}</h3>
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
