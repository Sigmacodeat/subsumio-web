"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import type { SolutionContent, SolutionSlug } from "@/content/solutions";
import { SOLUTION_SLUGS, SOLUTION_CROSS_LINKS } from "@/content/solutions";
import {
  Section,
  SectionHeading,
  ICONS,
  accentTile,
  CTASection,
  H1_CLASS,
  H2_CTA_CLASS,
  BadgePill,
} from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { GlowCard, ClipReveal, EASE, Reveal, StaggerContainer, StaggerItem } from "./motion-system";

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
      {icons.map((feat) => {
        const Icon = ICONS[feat.icon] ?? ICONS.Layers;
        return (
          <div
            key={feat.title}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${accentTile("violet", "light")}`}
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE.out }}
            className="inline-flex"
          >
            <BadgePill>{content.badge}</BadgePill>
          </motion.span>
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className={H1_CLASS}>
              {content.h1a}
              <br />
              <span className="brand-text">{content.h1b}</span>
            </h1>
          </ClipReveal>
          <motion.p
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
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
              <Button size="lg" variant="primary" className="group min-h-[48px]">
                {content.ctaButton}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Button>
            </Link>
            <Link href={p(lang, "/")}>
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
          <StaggerContainer className="grid gap-4 md:grid-cols-3" stagger={0.08}>
            {content.pains.map((pain) => (
              <StaggerItem key={pain.title}>
                <GlowCard
                  glowColor="var(--signal-rose)"
                  intensity={0.1}
                  className="h-full rounded-2xl border border-rose-200/40 bg-rose-50/30 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-rose-500/10 dark:bg-rose-500/5"
                >
                  <AlertCircle size={20} className="mb-3 [color:var(--signal-rose)]" />
                  <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                    {pain.title}
                  </h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {pain.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </Section>

      {/* Features */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={content.featuresTitle} tone="light" />
          <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" stagger={0.06}>
            {content.features.map((feat) => {
              const Icon = ICONS[feat.icon] ?? ICONS.Layers;
              return (
                <StaggerItem key={feat.title}>
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
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </Section>

      {/* Proof band */}
      <Section tone="dark" className="relative overflow-hidden px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal variant="scale" delay={0.1}>
            <div className="rounded-3xl border [border-color:var(--mk-border)] p-8 [background:var(--mk-surface)] md:p-12">
              <div className="brand-soft brand-border mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border">
                <CheckCircle size={24} className="brand-text" />
              </div>
              <h2 className={`${H2_CTA_CLASS} mb-4`}>{content.proofTitle}</h2>
              <p className="mx-auto max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                {content.proof}
              </p>
            </div>
          </Reveal>
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
      <CTASection
        title={content.ctaTitle}
        sub={content.ctaSub}
        href={p(lang, "/signup")}
        label={content.ctaButton}
        showLogo={false}
      />
    </>
  );
}
