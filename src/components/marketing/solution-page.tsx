"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import type { SolutionContent } from "@/content/solutions";
import { Section, SectionHeading, ICONS, accentTile, type Tone } from "./chrome";

export function SolutionPage({ lang, content }: { lang: Lang; content: SolutionContent }) {
  return (
    <>
      {/* Hero */}
      <Section tone="light" className="px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            className="brand-soft brand-text brand-border mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="brand-bg badge-pulse h-1.5 w-1.5 rounded-full" />
            {content.badge}
          </motion.span>
          <motion.h1
            className="text-4xl font-black tracking-tight [color:var(--mk-text)] md:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            {content.h1a}
            <br />
            <span className="brand-text">{content.h1b}</span>
          </motion.h1>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            {content.sub}
          </motion.p>
          <motion.div
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href={p(lang, "/signup")}>
              <Button size="lg" variant="glow" className="group min-h-[48px]">
                {content.ctaButton}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Button>
            </Link>
            <Link href={p(lang, "/subsumio")}>
              <Button size="lg" variant="ghost" className="min-h-[48px] [color:var(--mk-text)]">
                {lang === "de" ? "Plattform ansehen" : "See the platform"}
              </Button>
            </Link>
          </motion.div>
        </div>
      </Section>

      {/* Pains */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={content.painsTitle} tone="light" />
          <div className="grid gap-4 md:grid-cols-3">
            {content.pains.map((pain, i) => (
              <motion.div
                key={pain.title}
                className="rounded-2xl border border-rose-200/40 bg-rose-50/30 p-6 dark:border-rose-500/10 dark:bg-rose-500/5"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
                transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <AlertCircle size={20} className="mb-3 text-rose-500" />
                <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                  {pain.title}
                </h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{pain.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Features */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={content.featuresTitle} tone="light" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.features.map((feat, i) => {
              const Icon = ICONS[feat.icon] ?? ICONS.Layers;
              return (
                <motion.div
                  key={feat.title}
                  className="rounded-2xl border [border-color:var(--mk-border)] p-5 [background:var(--mk-surface)]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
                  transition={{ duration: 0.45, delay: (i % 4) * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border ${accentTile("violet", "light")}`}
                  >
                    <Icon size={18} />
                  </div>
                  <h3 className="mb-1.5 text-sm font-semibold [color:var(--mk-text)]">
                    {feat.title}
                  </h3>
                  <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                    {feat.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Proof band */}
      <Section tone="dark" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)] md:p-12"
          >
            <div className="brand-soft brand-border mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border">
              <CheckCircle size={24} className="brand-text" />
            </div>
            <h2 className="mb-4 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {content.proofTitle}
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)]">
              {content.proof}
            </p>
          </motion.div>
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionHeading
            title={lang === "de" ? "Fragen, beantwortet" : "Questions, answered"}
            tone="light"
          />
          <div className="space-y-3">
            {content.faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] open:[border-color:var(--mk-border-strong)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium [color:var(--mk-text)]">
                  {item.q}
                  <ArrowRight
                    size={15}
                    className="ml-4 shrink-0 [color:var(--mk-text-subtle)] transition-transform group-open:rotate-90"
                  />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section tone="light" className="px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="mb-4 text-3xl font-black tracking-tight [color:var(--mk-text)] md:text-4xl">
            {content.ctaTitle}
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg [color:var(--mk-text-muted)]">
            {content.ctaSub}
          </p>
          <Link href={p(lang, "/signup")}>
            <Button size="lg" variant="glow" className="group min-h-[48px]">
              {content.ctaButton}
              <ArrowRight
                size={16}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Button>
          </Link>
        </motion.div>
      </Section>
    </>
  );
}
