"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import type { SolutionContent, SolutionSlug } from "@/content/solutions";
import { SOLUTION_SLUGS, SOLUTION_CROSS_LINKS } from "@/content/solutions";
import { Section, SectionHeading, ICONS, accentTile } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { GlowCard, ClipReveal, MagneticButton, GradientMesh, EASE } from "./motion-system";

/** Per-vertical hero motif: a small floating constellation built from this
 *  vertical's own first 3 feature icons, so each of the 4 /solutions/* pages
 *  reads visually distinct even though they share one layout component. */
function HeroIconConstellation({ content }: { content: SolutionContent }) {
  const icons = content.features.slice(0, 3);
  return (
    <motion.div
      className="mt-10 flex items-center justify-center gap-4"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.3, ease: EASE.out }}
    >
      {icons.map((feat, i) => {
        const Icon = ICONS[feat.icon] ?? ICONS.Layers;
        return (
          <div
            key={feat.title}
            className={`float-gentle flex h-12 w-12 items-center justify-center rounded-2xl border ${accentTile("violet", "light")}`}
            style={{ animationDelay: `${i * 0.4}s` }}
            title={feat.title}
          >
            <Icon size={20} />
          </div>
        );
      })}
    </motion.div>
  );
}

export function SolutionPage({ lang, content }: { lang: Lang; content: SolutionContent }) {
  const ui = UI_STRINGS[lang];
  return (
    <>
      {/* Hero */}
      <Section tone="light" className="px-4 pt-20 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.span
            className="brand-soft brand-text brand-border mb-6 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE.out }}
          >
            <span className="brand-bg badge-pulse h-1.5 w-1.5 rounded-full" />
            {content.badge}
          </motion.span>
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className="text-[clamp(2.5rem,10vw,3.75rem)] leading-[1.07] font-black tracking-tight [color:var(--mk-text)] md:text-5xl lg:text-6xl">
              {content.h1a}
              <br />
              <span className="brand-text">{content.h1b}</span>
            </h1>
          </ClipReveal>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: EASE.out }}
          >
            {content.sub}
          </motion.p>
          <motion.div
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2, ease: EASE.out }}
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
                {ui.seePlatform}
              </Button>
            </Link>
          </motion.div>
          <HeroIconConstellation content={content} />
        </div>
      </Section>

      {/* Pains */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={content.painsTitle} tone="light" />
          <div className="grid gap-4 md:grid-cols-3">
            {content.pains.map((pain, i) => (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
                transition={{ duration: 0.45, delay: i * 0.08, ease: EASE.out }}
              >
                <GlowCard
                  glowColor="#be123c"
                  intensity={0.1}
                  className="h-full rounded-2xl border border-rose-200/40 bg-rose-50/30 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-rose-500/10 dark:bg-rose-500/5"
                >
                  <AlertCircle size={20} className="mb-3 text-rose-500" />
                  <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                    {pain.title}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {pain.desc}
                  </p>
                </GlowCard>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Features */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={content.featuresTitle} tone="light" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.features.map((feat, i) => {
              const Icon = ICONS[feat.icon] ?? ICONS.Layers;
              return (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
                  transition={{ duration: 0.45, delay: (i % 4) * 0.06, ease: EASE.out }}
                >
                  <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-5 transition-all duration-300 [background:var(--mk-surface)] hover:-translate-y-1 hover:[border-color:var(--mk-border-strong)] hover:shadow-lg">
                    <div
                      className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-300 hover:scale-110 ${accentTile("violet", "light")}`}
                    >
                      <Icon size={18} />
                    </div>
                    <h3 className="mb-1.5 text-base font-semibold [color:var(--mk-text)]">
                      {feat.title}
                    </h3>
                    <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                      {feat.desc}
                    </p>
                  </GlowCard>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Proof band */}
      <Section tone="dark" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <GradientMesh className="opacity-50" />
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
            transition={{ duration: 0.5, ease: EASE.out }}
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
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionHeading title={ui.questionsAnswered} tone="light" />
          <AnimatedFaqList items={content.faq} tone="light" />
        </div>
      </Section>

      {/* Cross-link: not quite the right fit? */}
      <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-4 text-sm font-medium [color:var(--mk-text-subtle)]">
            {ui.notQuiteRight}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {SOLUTION_SLUGS.filter((slug) => slug !== content.slug).map((slug: SolutionSlug) => {
              const link = SOLUTION_CROSS_LINKS[lang][slug];
              const Icon = ICONS[link.icon] ?? ICONS.Layers;
              return (
                <Link
                  key={slug}
                  href={p(lang, `/solutions/${slug}`)}
                  className="inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 text-sm font-medium [color:var(--mk-text-muted)] transition-all hover:[border-color:var(--mk-border-strong)] hover:[color:var(--mk-text)]"
                >
                  <Icon size={14} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section tone="light" className="px-4 py-28 sm:px-6 lg:px-8">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
          transition={{ duration: 0.5, ease: EASE.out }}
        >
          <h2 className="mb-4 text-3xl font-black tracking-tight [color:var(--mk-text)] md:text-4xl">
            {content.ctaTitle}
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg [color:var(--mk-text-muted)]">
            {content.ctaSub}
          </p>
          <Link href={p(lang, "/signup")}>
            <MagneticButton strength={0.25}>
              <Button size="lg" variant="glow" className="group min-h-[48px]">
                {content.ctaButton}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Button>
            </MagneticButton>
          </Link>
        </motion.div>
      </Section>
    </>
  );
}
