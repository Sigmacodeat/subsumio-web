"use client";

// Homepage audience-segment teaser — tab-switcher pattern seen on Legartis
// (Legal/Sales/Procurement/Construction). Reuses the real /solutions/* content
// (no fabricated copy) so the four verticals get above-the-fold visibility
// instead of being reachable only via the nav mega-dropdown.

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import { ArrowRight } from "lucide-react";
import { useMarket } from "@/lib/use-market";
import {
  SOLUTION_SLUGS,
  SOLUTION_CROSS_LINKS,
  SOLUTIONS,
  type SolutionSlug,
} from "@/content/solutions";
import { ICONS } from "./icons";
import { EASE } from "./motion-system";
import { EYEBROW_CLASS } from "./typography";

export default function AudienceTabs() {
  const { ui: UI_STRINGS, p } = useMarket();
  const [active, setActive] = useState<SolutionSlug>(SOLUTION_SLUGS[0]);
  // Tab switching keeps its crossfade under reduced motion — only the
  // translate is dropped, since that is the vestibular part.
  const reduce = useReducedMotion();
  const labels = SOLUTION_CROSS_LINKS;
  const content = SOLUTIONS[active];

  return (
    <section
      data-tone="light"
      className="relative z-10 px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
          {SOLUTION_SLUGS.map((slug) => {
            const label = labels[slug];
            const Icon = ICONS[label.icon] ?? ICONS.Layers;
            const isActive = slug === active;
            return (
              <button
                key={slug}
                data-slug={slug}
                onClick={() => setActive(slug)}
                className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] motion-reduce:transition-none ${
                  isActive
                    ? "brand-border brand-soft brand-text"
                    : "[border-color:var(--mk-border)] [color:var(--mk-text-muted)] hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)]"
                } focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99]`}
              >
                <Icon size={14} />
                {label.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -10 }}
            transition={{ duration: 0.25, ease: EASE.out }}
            className="rounded-2xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)] md:p-10"
          >
            <p className={`mb-4 ${EYEBROW_CLASS}`}>{content.badge}</p>
            {/* h2: the audience band has no other heading, and the site's h2
                rule sets it in the serif — an Inter h3 faked the italic. */}
            <h2 className="mb-3 [font-family:var(--font-display)] text-2xl leading-tight font-medium tracking-[-0.015em] text-balance [color:var(--mk-text)] md:text-[2rem]">
              {content.h1a} <span className="gradient-text">{content.h1b}</span>
            </h2>
            <p className="mb-6 max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
              {content.sub}
            </p>
            <Link
              href={p(`/solutions/${active}`)}
              className="brand-text group inline-flex items-center gap-1.5 text-sm font-semibold"
            >
              {UI_STRINGS.seeSolution}
              <ArrowRight
                size={14}
                className="transition-transform duration-[var(--ds-duration-normal)] group-hover:translate-x-0.5"
              />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
