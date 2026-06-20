"use client";

// /compare — honest competitive comparison page. Renders the matrices from
// content/compare.ts with colorized cells (✓ green, ✗ rose, ~ amber,
// "k. A."/"n/a" gray). The page deliberately shows lost rows; do not "fix"
// the content to win them.
//
// Presentation: framer-motion scroll-reveals, a sticky table header, and a
// dedicated mobile card view (the wide matrices are unreadable as a single
// horizontally-scrolling table on phones). Decorative motion respects
// prefers-reduced-motion via <MotionConfig reducedMotion="user">.

import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { ArrowRight, Check, X, Minus, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import { COMPARE, type CompareTable } from "@/content/compare";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
} from "./chrome";
import { ScrollProgress } from "./motion-system";
import BackToTop from "./back-to-top";

function CellValue({ value }: { value: string }) {
  if (value.startsWith("✓")) {
    return (
      <span className="inline-flex items-start gap-1.5 text-[var(--brand-secondary)]">
        <Check size={14} className="shrink-0 mt-0.5" />
        <span className="[color:var(--mk-text-muted)]">{value.slice(1).trim() || "Ja"}</span>
      </span>
    );
  }
  if (value.startsWith("✗")) {
    return (
      <span className="inline-flex items-start gap-1.5 [color:var(--signal-rose)]">
        <X size={14} className="shrink-0 mt-0.5" />
        <span className="[color:var(--mk-text-muted)]">{value.slice(1).trim() || "Nein"}</span>
      </span>
    );
  }
  if (value.startsWith("~")) {
    return (
      <span className="inline-flex items-start gap-1.5 [color:var(--signal-amber)]">
        <Minus size={14} className="shrink-0 mt-0.5" />
        <span className="[color:var(--mk-text-muted)]">{value.slice(1).trim()}</span>
      </span>
    );
  }
  if (value === "k. A." || value === "n/a") {
    return (
      <span className="inline-flex items-center gap-1.5 [color:var(--mk-text-subtle)]">
        <CircleHelp size={13} className="shrink-0" />
        {value}
      </span>
    );
  }
  return <span className="[color:var(--mk-text-muted)]">{value}</span>;
}

const viewport = { once: true, margin: "-60px" } as const;

function CompareMatrix({ table }: { table: CompareTable }) {
  return (
    <div>
      <SectionHeading title={table.title} sub={table.sub} />

      {/* Desktop / tablet: full matrix with sticky header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="hidden md:block overflow-x-auto rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]"
      >
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="border-b [border-color:var(--mk-border)]">
              <th
                scope="col"
                className="sticky top-0 z-10 [background:var(--mk-surface)] text-left p-4 [color:var(--mk-text-muted)] font-medium w-64"
              >
                <span className="sr-only">Feature</span>
              </th>
              {table.cols.map((col, i) => (
                <th
                  key={col}
                  scope="col"
                  className={`sticky top-0 z-10 text-left p-4 font-semibold ${
                    i === 0
                      ? "text-[var(--brand-primary)] [background:var(--mk-surface-2)]"
                      : "[color:var(--mk-text)] [background:var(--mk-surface)]"
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--mk-border)]">
            {table.rows.map((row, ri) => (
              <motion.tr
                key={row.label}
                className="align-top hover:[background:var(--mk-hover)] transition-colors"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={viewport}
                transition={{ duration: 0.3, delay: Math.min(ri * 0.025, 0.3) }}
              >
                <th scope="row" className="p-4 text-left [color:var(--mk-text)] font-medium">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={i} className={`p-4 ${i === 0 ? "bg-[var(--brand-primary)]/[0.04]" : ""}`}>
                    <CellValue value={cell} />
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      {/* Mobile: one card per row, each column listed vertically */}
      <div className="md:hidden space-y-3">
        {table.rows.map((row, ri) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.3, delay: Math.min(ri * 0.03, 0.25) }}
            className="rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] overflow-hidden"
          >
            <p className="px-4 py-3 text-sm font-semibold [color:var(--mk-text)] border-b [border-color:var(--mk-border)] [background:var(--mk-hover)]">
              {row.label}
            </p>
            <dl className="divide-y divide-[var(--mk-border)]">
              {row.cells.map((cell, i) => (
                <div
                  key={i}
                  className={`flex items-start justify-between gap-3 px-4 py-2.5 ${
                    i === 0 ? "bg-[var(--brand-primary)]/[0.05]" : ""
                  }`}
                >
                  <dt
                    className={`text-xs shrink-0 ${
                      i === 0 ? "text-[var(--brand-primary)] font-semibold" : "[color:var(--mk-text-muted)]"
                    }`}
                  >
                    {table.cols[i]}
                  </dt>
                  <dd className="text-right text-sm">
                    <CellValue value={cell} />
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {table.footnotes.map((note, i) => (
          <li key={i} className="text-xs [color:var(--mk-text-subtle)] leading-relaxed">
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ComparePage({ lang }: { lang: Lang }) {
  const t = COMPARE[lang];

  return (
    <MotionConfig reducedMotion="user">
      <div data-tone="light" className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
        <ScrollProgress />
        <MarketingBackground />
        <MarketingNav lang={lang} />

        {/* Hero */}
        <section className="relative z-10 pt-20 pb-16 px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-4xl mx-auto text-center"
          >
            <span className="inline-block px-3 py-1 rounded-full border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-xs font-medium mb-6">
              {t.badge}
            </span>
            <h1 className="text-4xl md:text-5xl font-bold [color:var(--mk-text)] leading-tight mb-6">
              {t.h1a}
              <br />
              <span className="text-[var(--brand-primary)]">{t.h1b}</span>
            </h1>
            <p className="text-lg [color:var(--mk-text-muted)] leading-relaxed max-w-3xl mx-auto">{t.sub}</p>
            <p className="text-xs [color:var(--mk-text-subtle)] mt-6">{t.snapshot}</p>
          </motion.div>
        </section>

        {/* Honesty block — what we are NOT */}
        <section className="relative z-10 py-12 px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="max-w-4xl mx-auto p-7 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04]"
          >
            <h2 className="text-lg font-bold [color:var(--signal-amber)] mb-3">{t.honestyTitle}</h2>
            <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{t.honestyText}</p>
          </motion.div>
        </section>

        {/* Matrix 1: legal AI */}
        <section className="relative z-10 py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <CompareMatrix table={t.legal} />
          </div>
        </section>

        {/* Matrix 2: governance & EU compliance */}
        <section className="relative z-10 py-16 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-6xl mx-auto">
            <CompareMatrix table={t.gov} />
          </div>
        </section>

        {/* Matrix 3: knowledge tools */}
        <section className="relative z-10 py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <CompareMatrix table={t.km} />
          </div>
        </section>

        {/* When them / when us */}
        <section className="relative z-10 py-20 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={viewport}
              transition={{ duration: 0.4 }}
              className="p-7 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]"
            >
              <h3 className="text-base font-bold [color:var(--mk-text)] mb-4">{t.whenThem.title}</h3>
              <ul className="space-y-3">
                {t.whenThem.items.map((item, i) => (
                  <li key={i} className="text-sm [color:var(--mk-text-muted)] leading-relaxed flex gap-2.5">
                    <ArrowRight size={14} className="[color:var(--mk-text-subtle)] shrink-0 mt-1" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={viewport}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="p-7 rounded-2xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/[0.05]"
            >
              <h3 className="text-base font-bold text-[var(--brand-primary)] mb-4">{t.whenUs.title}</h3>
              <ul className="space-y-3">
                {t.whenUs.items.map((item, i) => (
                  <li key={i} className="text-sm [color:var(--mk-text-muted)] leading-relaxed flex gap-2.5">
                    <Check size={14} className="text-[var(--brand-primary)] shrink-0 mt-1" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative z-10 py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </div>
        </section>

        {/* Sources + disclaimer */}
        <section className="relative z-10 py-16 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-sm font-semibold [color:var(--mk-text-muted)] mb-4">{t.sourcesTitle}</h3>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mb-8">
              {t.sources.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="text-xs text-[var(--brand-primary)]/80 hover:text-[var(--brand-primary)] hover:underline"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-xs [color:var(--mk-text-subtle)] leading-relaxed">{t.disclaimer}</p>
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 py-28 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
            <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
            <Link href={p(lang, "/signup")}>
              <Button size="xl" variant="glow">
                {t.ctaButton} <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </section>

        <MarketingFooter lang={lang} />
        <BackToTop lang={lang} />
      </div>
    </MotionConfig>
  );
}
