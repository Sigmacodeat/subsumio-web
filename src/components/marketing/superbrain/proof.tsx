"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { p, UI_STRINGS } from "@/content/site";
import { ClipReveal, GlowCard, StaggerContainer, StaggerItem } from "../motion-system";
import { Section, H2_CTA_CLASS } from "../primitives";
import { AnimatedFaqList } from "../animated-faq";
import { reveal, type SuperbrainCopyDe } from "./shared";
import { resolveIcon } from "../icons";

export function PrivacySection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="Privacy & DSGVO">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.privacyTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.privacySub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-6 md:grid-cols-2" stagger={0.1}>
          {t.privacyPoints.map((point) => {
            const Icon = resolveIcon(point.icon);
            return (
              <StaggerItem key={point.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                    <Icon size={22} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold [color:var(--mk-text)]">{point.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {point.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </Section>
  );
}

export function UseCasesSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section
      tone="light"
      className="px-4 py-24 sm:px-6 lg:px-8"
      aria-label={UI_STRINGS.ariaUseCases}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.useCasesTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.useCasesSub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
          {t.useCases.map((uc) => {
            const Icon = resolveIcon(uc.icon);
            return (
              <StaggerItem key={uc.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                    <Icon size={20} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold [color:var(--mk-text)]">{uc.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{uc.desc}</p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p("/features")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {UI_STRINGS.exploreAllFeatures} <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

export function TrustSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section
      tone="light"
      className="px-4 py-24 sm:px-6 lg:px-8"
      aria-label={UI_STRINGS.ariaCompliance}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.trustTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.trustSub}
          </motion.p>
        </div>

        <div className="mb-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {t.trustBadges.map((badge, i) => (
            <motion.div
              key={badge.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl border [border-color:var(--mk-border)] p-6 text-center [background:var(--mk-surface)]"
            >
              <div className="brand-text mb-2 [font-family:var(--font-display)] text-lg font-bold">
                {badge.label}
              </div>
              <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{badge.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <h3 className="mb-6 [font-family:var(--font-display)] text-xl font-bold [color:var(--mk-text)]">
            {t.integrationsTitle}
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {t.integrations.map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 [background:var(--mk-surface)]"
              >
                <span className="text-sm font-semibold [color:var(--mk-text)]">
                  {integration.name}
                </span>
                <span className="text-sm [color:var(--mk-text-subtle)]">{integration.desc}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p("/security")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {UI_STRINGS.readSecurityDetails} <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

export function FAQSection({ t }: { t: SuperbrainCopyDe }) {
  const faqItems = t.faq.map((item) => ({ q: item.q, a: item.a }));
  return (
    <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label={UI_STRINGS.ariaFaq}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{UI_STRINGS.faqSuperbrainTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {UI_STRINGS.faqSuperbrainSub}
          </motion.p>
        </div>

        <AnimatedFaqList items={faqItems} tone="light" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p("/pricing")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {UI_STRINGS.seePricingPlans} <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}
