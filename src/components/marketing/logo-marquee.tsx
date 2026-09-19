"use client";

// Premium dual-row logo marquee — agency-standard 2026 pattern.
// Pill-card items with borders, large icons, CSS mask-image edge fades,
// pause on hover, monochrome-to-color on hover. Respects prefers-reduced-motion.
// Research: Aceternity UI, shadcn.io, Vercel Geist, Ryan Mulligan CSS Marquee.

import { useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
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
import { EASE } from "./motion-system";
import { UI_STRINGS } from "@/content/site";

interface MarqueeItem {
  icon: typeof ShieldCheck;
  label: string;
}

const ROW_TOP: MarqueeItem[] = [
  { icon: ShieldCheck, label: "DSGVO-konform" },
  { icon: ScrollText, label: "Verschwiegenheit nach § 9 Abs. 2 RAO" },
  { icon: BadgeCheck, label: "AVV nach Art. 28 DSGVO" },
  { icon: FileCheck, label: "Aufbewahrung nach BAO" },
  { icon: Globe, label: "EU-Cloud" },
  { icon: Server, label: "On-Premise" },
  { icon: Lock, label: "Kein Training auf Ihren Daten" },
];

const ROW_BOTTOM: MarqueeItem[] = [
  { icon: Scale, label: "Kollisionsprüfung nach § 10 RAO" },
  { icon: Landmark, label: "Tarifleistungen nach RATG" },
  { icon: FileSignature, label: "DocuSign-Integration" },
  { icon: MessageSquare, label: "WhatsApp Business" },
  { icon: Gavel, label: "Nachvollziehbarer Audit-Trail" },
  { icon: Mail, label: "E-Mail-Postfach (IMAP)" },
  { icon: Cloud, label: "EU-Hosting mit AVV" },
  { icon: Database, label: "Rechtsquellen aus dem RIS" },
  { icon: FileText, label: "Word-Add-in" },
];

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
    <div
      className="relative flex overflow-hidden"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
      }}
    >
      <motion.div
        className="flex shrink-0 items-center gap-6 pr-6"
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
              ? { duration: 0.5, ease: EASE.out }
              : { duration, ease: "linear", repeat: Infinity }
        }
      >
        {loop.map((item, i) => {
          const Icon = item.icon;
          const isDuplicate = i >= items.length;
          return (
            <div
              key={`${item.label}-${i}`}
              aria-hidden={isDuplicate || undefined}
              className="group flex shrink-0 items-center gap-2.5 rounded-full border [border-color:var(--mk-border)] bg-[color:var(--mk-bg)] px-4 py-2 opacity-60 transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] hover:border-[color:var(--brand-text)] hover:opacity-100 hover:shadow-lg hover:shadow-[color:var(--brand-text)]/10 motion-reduce:transition-none"
            >
              <Icon
                size={20}
                className="text-[color:var(--brand-text)] transition-transform duration-[var(--ds-duration-normal)] group-hover:scale-110"
              />
              <span className="text-sm font-semibold whitespace-nowrap [color:var(--mk-text)]">
                {item.label}
              </span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

export default function LogoMarquee() {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);

  const topItems = ROW_TOP;
  const bottomItems = ROW_BOTTOM;

  const eyebrow = UI_STRINGS.certificationsEyebrow;
  const heading = UI_STRINGS.trustHeading;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- purely decorative hover-to-pause on an auto-scrolling marquee; not a control that needs a keyboard equivalent (motion already respects prefers-reduced-motion via useReducedMotion above).
    <section
      aria-label={eyebrow}
      data-tone="light"
      className="relative overflow-hidden py-14 [background:var(--mk-surface)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Section heading */}
      <div className="mb-12 text-center">
        <span
          className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold"
          style={{
            color: "var(--brand-text)",
            background: "color-mix(in srgb, var(--brand-text) 8%, transparent)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand-text)" }} />
          {eyebrow}
        </span>
        <p className="text-lg font-semibold [color:var(--mk-text-muted)]" role="presentation">
          {heading}
        </p>
      </div>

      {/* Row 1 — scrolls right to left */}
      <MarqueeRow items={topItems} direction={1} duration={35} paused={paused} reduce={reduce} />

      {/* Row 2 — scrolls left to right (opposite direction, slower) */}
      <div className="mt-8">
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
