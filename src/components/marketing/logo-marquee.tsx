"use client";

// Infinite logo/badge marquee — slides continuously from right to left.
// Agency-standard pattern (Stripe, Linear, Vercel, Notion). GPU-optimized
// via CSS transform animation. Respects prefers-reduced-motion.

import { useReducedMotion } from "framer-motion";
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
} from "lucide-react";
import type { Lang } from "@/content/site";

interface MarqueeItem {
  icon: typeof ShieldCheck;
  label: string;
}

const ITEMS: Record<string, MarqueeItem[]> = {
  de: [
    { icon: ShieldCheck, label: "DSGVO-konform" },
    { icon: ScrollText, label: "§ 203 StGB" },
    { icon: BadgeCheck, label: "SOC 2 Type II" },
    { icon: FileCheck, label: "ISO 27001" },
    { icon: Globe, label: "EU-Cloud" },
    { icon: Server, label: "On-Premise" },
    { icon: Lock, label: "Kein Training auf deinen Daten" },
    { icon: Scale, label: "BRAO-konform" },
    { icon: Landmark, label: "RVG-gebührenfähig" },
    { icon: FileSignature, label: "DocuSign-Integration" },
    { icon: MessageSquare, label: "WhatsApp Business" },
    { icon: Gavel, label: "GoBD-audit-ready" },
  ],
  en: [
    { icon: ShieldCheck, label: "GDPR-ready" },
    { icon: ScrollText, label: "Professional Secrecy" },
    { icon: BadgeCheck, label: "SOC 2 Type II" },
    { icon: FileCheck, label: "ISO 27001" },
    { icon: Globe, label: "EU-Cloud" },
    { icon: Server, label: "On-Premise" },
    { icon: Lock, label: "No training on your data" },
    { icon: Scale, label: "Bar-compliant" },
    { icon: Landmark, label: "RVG-billable" },
    { icon: FileSignature, label: "DocuSign Integration" },
    { icon: MessageSquare, label: "WhatsApp Business" },
    { icon: Gavel, label: "GoBD audit-ready" },
  ],
};

export default function LogoMarquee({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const items = ITEMS[lang] ?? ITEMS.de;

  // Duplicate items for seamless infinite loop
  const loop = [...items, ...items];

  return (
    <section
      aria-label={lang !== "en" ? "Zertifizierungen & Integrationen" : "Certifications & Integrations"}
      className="relative overflow-hidden border-y [border-color:var(--mk-border)] [background:var(--mk-surface)] py-8"
    >
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r [background:var(--mk-surface)] to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l [background:var(--mk-surface)] to-transparent" />

      <div
        className="flex items-center gap-10 whitespace-nowrap"
        style={
          reduce
            ? undefined
            : {
                animation: "marquee-scroll 40s linear infinite",
                willChange: "transform",
              }
        }
      >
        {loop.map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={`${item.label}-${i}`}
              className="flex shrink-0 items-center gap-2.5 text-sm font-semibold [color:var(--mk-text-muted)]"
            >
              <Icon
                size={18}
                className="text-[color:var(--brand-text)] opacity-70"
              />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes marquee-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
