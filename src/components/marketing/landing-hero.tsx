"use client";

// Landing hero — the one hook-driven part of the page: staggered entrance
// animations over a quiet sapphire light source. Extracted so landing.tsx can
// be a Server Component; this island hydrates on its own.

import Link from "next/link";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import {
  ArrowRight,
  Check,
  CreditCard,
  Scale,
  Globe,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMarket } from "@/lib/use-market";
import { Section } from "./primitives";
import { EASE, MagneticButton, SplitTextReveal } from "./motion-system";
import RotatingBadge from "./rotating-badge";
import ProductDemo from "./product-demo";

const TRUST_ICONS: Record<string, LucideIcon> = {
  CreditCard,
  Scale,
  Globe,
  ShieldCheck,
};

export default function LandingHero() {
  const { landing: t, ui, p } = useMarket();
  const reduce = useReducedMotion();

  return (
    /* Hero — centered single column: message first, product story
       continues below the fold. The centered layout keeps the fold
       uncluttered and passes the 5-second clarity test. */
    <Section
      tone="slate"
      noTopEdge
      className="relative overflow-hidden px-6 pt-20 pb-20 md:pt-24 md:pb-24"
    >
      {/* One light source above the headline — depth without decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[720px]"
        style={{
          background:
            "radial-gradient(56% 60% at 50% 0%, color-mix(in srgb, var(--brand-primary) 20%, transparent), transparent 72%)",
        }}
      />

      {/* Centered column — constrained width keeps long lines readable */}
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="text-center">
          {/* Rotating badge — crossfades through 3 differentiators */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.05 }}
            className="flex justify-center"
          >
            <RotatingBadge items={t.heroBadges} />
          </motion.div>

          {/* H1 — Newsreader at display size: weight 500, contrast does the work */}
          <h1
            className="mb-5 text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.04] font-medium tracking-[-0.022em] text-balance [color:var(--mk-text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <SplitTextReveal
              as="span"
              delay={0.12}
              stagger={0.035}
              useAnimate
              lcp
              className="block"
            >
              {`${t.h1a}\n${t.h1b}`}
            </SplitTextReveal>
          </h1>

          {/* Sub-paragraph — 1 sentence, ≤160 chars. Transform-only
              entrance: this is the LCP element on mobile, so it must be
              painted at FCP (no opacity gate). */}
          <motion.div
            initial={reduce ? false : { x: -20 }}
            animate={{ x: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.21 }}
          >
            <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
              {t.sub}
            </p>
          </motion.div>

          {/* CTAs — primary dominant, secondary ghost, tertiary text link.
              Transform-only entrance (LCP-safe). */}
          <motion.div
            initial={reduce ? false : { y: 16 }}
            animate={{ y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.out, delay: 0.26 }}
            className="mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <MagneticButton strength={0.35}>
              <Button size="xl" variant="primary" className="min-w-[220px]" asChild>
                <Link href={p("/signup")}>
                  {t.ctaPrimary} <ArrowRight size={18} />
                </Link>
              </Button>
            </MagneticButton>
            <Button size="lg" variant="ghost" asChild>
              <Link href="#pricing" className="inline-flex">
                {ui.seePlans} <ArrowRight size={16} />
              </Link>
            </Button>
          </motion.div>

          {/* Product demo — the thesis of the page, shown before any trust claim */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE.out, delay: 0.32 }}
            className="mb-10"
          >
            <ProductDemo className="mx-auto max-w-5xl" />
          </motion.div>

          {/* Trust pills — icon + text, staggered */}
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.dramatic, delay: 0.34 }
            }
            className="flex flex-wrap justify-center gap-3"
          >
            {t.heroTrustItems.map((item, i) => {
              const Icon = TRUST_ICONS[item.icon] ?? Check;
              return (
                <motion.span
                  key={item.label}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { delay: 0.36 + i * 0.04, duration: 0.3, ease: EASE.out }
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 text-sm [color:var(--mk-text-muted)] [background:var(--mk-surface)]"
                >
                  <Icon size={12} className="text-[var(--brand-secondary)]" />
                  {item.label}
                </motion.span>
              );
            })}
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
