"use client";

// Homepage audience-segment teaser — tab-switcher pattern seen on Legartis
// (Legal/Sales/Procurement/Construction). Reuses the real /solutions/* content
// (no fabricated copy) so the four verticals get above-the-fold visibility
// instead of being reachable only via the nav mega-dropdown.

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import {
  SOLUTION_SLUGS,
  SOLUTION_CROSS_LINKS,
  SOLUTIONS,
  type SolutionSlug,
} from "@/content/solutions";
import { ICONS } from "./chrome";
import { EASE } from "./motion-system";

export default function AudienceTabs({ lang }: { lang: Lang }) {
  const [active, setActive] = useState<SolutionSlug>(SOLUTION_SLUGS[0]);
  const labels = SOLUTION_CROSS_LINKS[lang];
  const content = SOLUTIONS[lang][active];

  return (
    <section data-tone="light" className="relative z-10 px-4 py-24 sm:px-6 lg:px-8">
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
                className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "brand-border brand-soft brand-text"
                    : "[border-color:var(--mk-border)] [color:var(--mk-text-muted)] hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)]"
                }`}
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: EASE.out }}
            className="rounded-2xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)] md:p-10"
          >
            <span className="brand-soft brand-text brand-border mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold">
              {content.badge}
            </span>
            <h3 className="mb-3 [font-family:var(--font-display)] text-2xl font-black tracking-tight [color:var(--mk-text)] md:text-3xl">
              {content.h1a} <span className="brand-text">{content.h1b}</span>
            </h3>
            <p className="mb-6 max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)]">
              {content.sub}
            </p>
            <Link
              href={p(lang, `/solutions/${active}`)}
              className="brand-text group inline-flex items-center gap-1.5 text-sm font-semibold"
            >
              {UI_STRINGS[lang].seeSolution}
              <ArrowRight
                size={14}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
