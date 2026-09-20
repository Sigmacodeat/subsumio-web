"use client";

import { motion } from "framer-motion";
import { Check, Power, PowerOff, ShieldCheck } from "lucide-react";
import { ClipReveal, GlowCard, StaggerContainer, StaggerItem } from "../motion-system";
import { Section, H2_CTA_CLASS } from "../primitives";
import { reveal, type SuperbrainCopyDe } from "./shared";
import { resolveIcon } from "../icons";

/**
 * "Ihr Kanzlei-Gehirn lernt mit" — what the firm's own knowledge learns, the
 * firm-wide switch, and what never happens. Every sentence is backed by
 * docs/architecture/BRAIN_LEARNING.md.
 */
export function LearningSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section
      tone="light"
      id="kanzlei-gehirn"
      className="px-4 py-24 sm:px-6 lg:px-8"
      aria-label={t.learningTitle}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <motion.span
            {...reveal}
            className="brand-soft brand-border brand-text mb-4 inline-block rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase"
          >
            {t.learningBadge}
          </motion.span>
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.learningTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.learningSub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-6 sm:grid-cols-2" stagger={0.08}>
          {t.learningPoints.map((point) => {
            const Icon = resolveIcon(point.icon);
            return (
              <StaggerItem key={point.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                    <Icon size={20} className="brand-text" />
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

        <div className="mt-10 grid gap-6 lg:grid-cols-5">
          <motion.div
            {...reveal}
            className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] lg:col-span-3"
          >
            <h3 className="mb-4 text-lg font-bold [color:var(--mk-text)]">
              {t.learningSwitchTitle}
            </h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                { ...t.learningSwitchOn, Icon: Power },
                { ...t.learningSwitchOff, Icon: PowerOff },
              ].map(({ label, desc, Icon }) => (
                <div key={label} className="rounded-xl border [border-color:var(--mk-border)] p-4">
                  <dt className="mb-1 flex items-center gap-2 text-sm font-semibold [color:var(--mk-text)]">
                    <Icon size={16} className="brand-text" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{desc}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs leading-relaxed [color:var(--mk-text-muted)]">
              {t.learningSwitchNote}
            </p>
          </motion.div>

          <motion.div
            {...reveal}
            className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] lg:col-span-2"
          >
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold [color:var(--mk-text)]">
              <ShieldCheck size={20} className="brand-text" aria-hidden="true" />
              {t.learningNeverTitle}
            </h3>
            <ul className="space-y-3">
              {t.learningNever.map((line) => (
                <li
                  key={line}
                  className="flex gap-2 text-sm leading-relaxed [color:var(--mk-text-muted)]"
                >
                  <Check size={16} className="brand-text mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}
