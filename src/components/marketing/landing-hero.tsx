"use client";

// Landing hero — the one hook-driven part of the page: parallax background
// motif + staggered entrance animations. Extracted so landing.tsx can be a
// Server Component; this island hydrates on its own.

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import {
  ArrowRight,
  Check,
  CreditCard,
  Scale,
  Globe,
  ShieldCheck,
  BadgeCheck,
  FileCheck,
  Server,
  Play,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LANDING, UI_STRINGS, p } from "@/content/site";
import { Section } from "./primitives";
import { EASE, MagneticButton, SplitTextReveal } from "./motion-system";
import IndustryHeroMotif from "./industry-hero-motif";
import RotatingBadge from "./rotating-badge";
import ProductDemo from "./product-demo";

const TRUST_ICONS: Record<string, LucideIcon> = {
  CreditCard,
  Scale,
  Globe,
  ShieldCheck,
  BadgeCheck,
  FileCheck,
  Server,
};

export default function LandingHero() {
  const t = LANDING;
  const ui = UI_STRINGS;
  const reduce = useReducedMotion();

  // Subtle parallax for hero background motif (0.3x speed, transform-only)
  const { scrollYProgress: heroScrollProgress } = useScroll({
    offset: ["start start", "end start"],
  });
  const motifY = useTransform(heroScrollProgress, [0, 1], [0, reduce ? 0 : 120]);
  const motifOpacity = useTransform(heroScrollProgress, [0, 0.8], [0.13, 0]);

  return (
    /* Hero — centered single column: message first, product story
       continues below the fold. The centered layout keeps the fold
       uncluttered and passes the 5-second clarity test. */
    <Section
      tone="slate"
      noTopEdge
      className="relative overflow-hidden px-6 pt-20 pb-20 md:pt-24 md:pb-24"
    >
      {/* Legal icon constellation — subtle parallax background motif */}
      <motion.div
        style={{ y: motifY, opacity: motifOpacity }}
        className="absolute inset-0 z-0 hidden md:block"
      >
        <IndustryHeroMotif industry="legal" className="h-full w-full opacity-[1]" />
      </motion.div>

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

          {/* Hero tagline — solid brand-text for guaranteed contrast on slate.
              Transform-only entrance: no opacity gate so the text paints at
              FCP and can count toward LCP. */}
          <motion.p
            initial={reduce ? false : { y: 10 }}
            animate={{ y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.16 }}
            className="mb-3 text-lg font-semibold [color:var(--brand-text)] md:text-xl"
          >
            {t.heroTagline}
          </motion.p>

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

          {/* Tertiary — scroll to demo */}
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.out, delay: 0.3 }}
            className="mb-8 flex justify-center"
          >
            <a
              href="#features"
              className="inline-flex items-center gap-1.5 text-sm font-medium [color:var(--mk-text-muted)] transition-[background-color,border-color,color] hover:text-[var(--brand-text)] motion-reduce:transition-none"
            >
              <Play size={14} />
              {ui.seeFeatures}
            </a>
          </motion.div>

          {/* Product demo — the thesis of the page, shown before any trust claim */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
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

          {/* Social proof — jurisdiction trust line */}
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASE.out, delay: 0.38 }}
            className="mt-6 text-sm [color:var(--mk-text-subtle)]"
          >
            {ui.trustedBy}
          </motion.p>
        </div>
      </div>

      {/* Trust strip — 5 badges with gradient divider, hero closing → marquee transition */}
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE.out, delay: 0.42 }}
        className="relative z-10 mx-auto mt-12 max-w-4xl pt-8"
      >
        {/* gradient divider — fades from transparent to border to transparent */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--mk-border-strong) 20%, var(--mk-border-strong) 80%, transparent)",
          }}
        />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {t.trustStripItems.map((item) => {
            const Icon = TRUST_ICONS[item.icon] ?? ShieldCheck;
            return (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 text-sm font-medium [color:var(--mk-text-muted)] transition-[background-color,border-color,color] hover:[color:var(--mk-text)] motion-reduce:transition-none"
              >
                <Icon size={14} className="text-[var(--brand-secondary)]" />
                {item.label}
              </span>
            );
          })}
        </div>
      </motion.div>
    </Section>
  );
}
