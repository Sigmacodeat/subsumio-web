"use client";

// Premium dual-row logo marquee — agency-standard pattern (Stripe, Linear,
// Vercel, Aceternity UI, shadcn.io). Two rows scroll in opposite directions
// with Framer Motion, pause on hover, monochrome items that brighten on hover,
// and gradient edge fades. Respects prefers-reduced-motion.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  Lock,
  Globe,
  Server,
  MessageSquare,
  FileSignature,
  ScrollText,
  BadgeCheck,
  Scale,
  Landmark,
  FileCheck,
  Gavel,
  Mail,
  Cloud,
  Database,
  FileText,
} from "lucide-react";
import type { Lang } from "@/content/site";

interface MarqueeItem {
  icon: typeof ShieldCheck;
  label: string;
}

const ROW_TOP: Record<string, MarqueeItem[]> = {
  de: [
    { icon: ShieldCheck, label: "DSGVO-konform" },
    { icon: ScrollText, label: "§ 203 StGB" },
    { icon: BadgeCheck, label: "SOC 2 Type II" },
    { icon: FileCheck, label: "ISO 27001" },
    { icon: Globe, label: "EU-Cloud" },
    { icon: Server, label: "On-Premise" },
    { icon: Lock, label: "Kein Training auf deinen Daten" },
  ],
  en: [
    { icon: ShieldCheck, label: "GDPR-ready" },
    { icon: ScrollText, label: "Professional Secrecy" },
    { icon: BadgeCheck, label: "SOC 2 Type II" },
    { icon: FileCheck, label: "ISO 27001" },
    { icon: Globe, label: "EU-Cloud" },
    { icon: Server, label: "On-Premise" },
    { icon: Lock, label: "No training on your data" },
  ],
};

const ROW_BOTTOM: Record<string, MarqueeItem[]> = {
  de: [
    { icon: Scale, label: "BRAO-konform" },
    { icon: Landmark, label: "RVG-gebührenfähig" },
    { icon: FileSignature, label: "DocuSign-Integration" },
    { icon: MessageSquare, label: "WhatsApp Business" },
    { icon: Gavel, label: "GoBD-audit-ready" },
    { icon: Mail, label: "beA-Anbindung" },
    { icon: Cloud, label: "EU-Hosting mit AVV" },
    { icon: Database, label: "Volltext-Indexierung" },
    { icon: FileText, label: "Office-Integration" },
  ],
  en: [
    { icon: Scale, label: "Bar-compliant" },
    { icon: Landmark, label: "RVG-billable" },
    { icon: FileSignature, label: "DocuSign Integration" },
    { icon: MessageSquare, label: "WhatsApp Business" },
    { icon: Gavel, label: "GoBD audit-ready" },
    { icon: Mail, label: "beA Integration" },
    { icon: Cloud, label: "EU Hosting with DPA" },
    { icon: Database, label: "Full-text Indexing" },
    { icon: FileText, label: "Office Integration" },
  ],
};

function MarqueeRow({
  items,
  direction,
  duration,
  paused,
  reduce,
}: {
  items: MarqueeItem[];
  direction: 1 | -1;
  duration: number;
  paused: boolean;
  reduce: boolean | null;
}) {
  const loop = [...items, ...items];

  return (
    <div className="relative flex overflow-hidden">
      <motion.div
        className="flex shrink-0 items-center gap-12 pr-12"
        animate={
          reduce
            ? undefined
            : paused
              ? { x: direction === 1 ? "-50%" : "0%" }
              : { x: direction === 1 ? ["0%", "-50%"] : ["-50%", "0%"] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : paused
              ? { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
              : { duration, ease: "linear", repeat: Infinity }
        }
      >
        {loop.map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={`${item.label}-${i}`}
              className="flex shrink-0 items-center gap-2.5 text-sm font-semibold [color:var(--mk-text-muted)] opacity-40 transition-opacity duration-300 hover:opacity-100"
            >
              <Icon
                size={18}
                className="text-[color:var(--brand-text)]"
              />
              <span className="whitespace-nowrap">{item.label}</span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

export default function LogoMarquee({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);

  const topItems = ROW_TOP[lang] ?? ROW_TOP.de;
  const bottomItems = ROW_BOTTOM[lang] ?? ROW_BOTTOM.de;

  const eyebrow =
    lang !== "en" ? "Zertifizierungen & Integrationen" : "Certifications & Integrations";
  const heading =
    lang !== "en" ? "Vertrauen, das man belegen kann" : "Trust you can verify";

  return (
    <section
      aria-label={eyebrow}
      className="relative overflow-hidden border-y [border-color:var(--mk-border)] [background:var(--mk-surface)] py-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Section heading */}
      <div className="mb-10 text-center">
        <span
          className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{
            color: "var(--brand-text)",
            background: "color-mix(in srgb, var(--brand-text) 8%, transparent)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--brand-text)" }}
          />
          {eyebrow}
        </span>
        <h3 className="text-base font-semibold [color:var(--mk-text-muted)]">
          {heading}
        </h3>
      </div>

      {/* Edge gradient fades */}
      <div
        className="pointer-events-none absolute left-0 top-0 z-10 h-full w-32"
        style={{
          background:
            "linear-gradient(to right, var(--mk-surface), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute right-0 top-0 z-10 h-full w-32"
        style={{
          background:
            "linear-gradient(to left, var(--mk-surface), transparent)",
        }}
      />

      {/* Row 1 — scrolls right to left */}
      <MarqueeRow
        items={topItems}
        direction={1}
        duration={35}
        paused={paused}
        reduce={reduce}
      />

      {/* Row 2 — scrolls left to right (opposite direction) */}
      <div className="mt-6">
        <MarqueeRow
          items={bottomItems}
          direction={-1}
          duration={42}
          paused={paused}
          reduce={reduce}
        />
      </div>
    </section>
  );
}
