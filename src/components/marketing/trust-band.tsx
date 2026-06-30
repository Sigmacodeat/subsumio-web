"use client";

// Light "trust" band — the serious, credibility-first counterpoint to the dark
// product sections (the light/dark mix). Cream surface, dark type, soft shadows
// (no glows), deliberate signal accents. This is the section that signals
// "trustworthy partner" rather than "tech startup" to a legal audience.

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Lock,
  Quote,
  ScrollText,
  BadgeCheck,
  FileCheck,
  Globe,
  Server,
} from "lucide-react";
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
  badges: [
    { icon: "badge-check", label: "SOC 2 Type II — Q4 2026" },
    { icon: "file-check", label: "ISO 27001 — geplant 2026" },
    { icon: "globe", label: "DSGVO-konform" },
    { icon: "server", label: "EU-Cloud oder On-Premise" },
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
    badges: [
      { icon: "badge-check", label: "SOC 2 Type II — Q4 2026" },
      { icon: "file-check", label: "ISO 27001 — planned 2026" },
      { icon: "globe", label: "GDPR-ready" },
      { icon: "server", label: "EU cloud or self-hosted" },
    ],
  },
} as const;

const SIGNAL: Record<string, { text: string; bg: string; ring: string }> = {
  blue: {
    text: "var(--brand-text)",
    bg: "color-mix(in srgb, var(--brand-text) 10%, transparent)",
    ring: "color-mix(in srgb, var(--brand-text) 20%, transparent)",
  },
  green: {
    text: "var(--signal-green)",
    bg: "color-mix(in srgb, var(--signal-green) 10%, transparent)",
    ring: "color-mix(in srgb, var(--signal-green) 20%, transparent)",
  },
  amber: {
    text: "var(--signal-amber)",
    bg: "color-mix(in srgb, var(--signal-amber) 10%, transparent)",
    ring: "color-mix(in srgb, var(--signal-amber) 20%, transparent)",
  },
};

const BADGE_ICONS: Record<string, typeof BadgeCheck> = {
  "badge-check": BadgeCheck,
  "file-check": FileCheck,
  globe: Globe,
  server: Server,
};

export default function TrustBand({ lang, industry }: { lang: Lang; industry?: string }) {
  const c = (COPY as unknown as Record<string, typeof COPY.de>)[lang] ?? COPY.de;
  const brand = profileForIndustry(industry)?.brand ?? "Subsumio";
  const sub = c.sub.replace("{brand}", brand);
  return (
    <section
      data-tone="light"
      aria-label={lang !== "en" ? "Sicherheit & Vertrauen" : "Security & Trust"}
      className="relative z-10 px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <span
            className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              color: "var(--brand-text)",
              background: "color-mix(in srgb, var(--brand-text) 10%, transparent)",
            }}
          >
            <span
              className="badge-pulse h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--brand-text)" }}
            />
            {c.eyebrow}
          </span>
          <h2 className="mb-4 [font-family:var(--font-display)] text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {c.title}
          </h2>
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
                viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
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
                    <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
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

        {/* Certification badges — SOC 2 prep, ISO 27001 planned, GDPR, EU cloud */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-3"
        >
          {c.badges.map((badge) => {
            const BadgeIcon = BADGE_ICONS[badge.icon] ?? BadgeCheck;
            return (
              <span
                key={badge.label}
                className="inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 text-xs font-semibold [color:var(--mk-text-muted)] [background:var(--mk-surface)]"
              >
                <BadgeIcon size={14} style={{ color: "var(--signal-green)" }} />
                {badge.label}
              </span>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
