"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { EASE, ClipReveal } from "../motion-system";
import { Section, H2_CTA_CLASS } from "../primitives";
import { reveal, type SuperbrainCopyDe } from "./shared";

export function CompareSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="Vergleich">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.compareTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.compareSub}
          </motion.p>
        </div>

        {/* Mobile: stacked card layout */}
        <div className="mt-8 space-y-3 md:hidden">
          {t.compareRows.map((row, i) => (
            <motion.div
              key={row.feature}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]"
            >
              <p className="mb-3 text-sm font-semibold [color:var(--mk-text)]">{row.feature}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-sm font-semibold [color:var(--mk-text-muted)]">
                    {"Andere Kanzlei-KI"}
                  </p>
                  <div className="flex items-start gap-1.5 text-sm [color:var(--mk-text-muted)]">
                    <span className="shrink-0 text-[color:var(--ds-category-rose-text)]">✕</span>
                    {row.others}
                  </div>
                </div>
                <div>
                  <p className="brand-text mb-1 text-sm font-semibold">Subsumio SuperBrain</p>
                  <div className="flex items-start gap-1.5 text-sm font-medium [color:var(--mk-text)]">
                    <CheckCircle2 size={13} className="brand-text mt-0.5 shrink-0" />
                    {row.subsumio}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        {/* Desktop: table layout */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: EASE.out }}
          className="hidden overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-xl md:block"
        >
          <table
            className="w-full text-left text-sm"
            aria-label="Vergleich: Subsumio SuperBrain vs. andere Kanzlei-KI"
          >
            <thead>
              <tr className="border-b [border-color:var(--mk-border)] [background:var(--mk-surface-2)]">
                <th className="px-5 py-4 font-semibold [color:var(--mk-text)]">{"Eigenschaft"}</th>
                <th className="px-5 py-4 font-semibold [color:var(--mk-text-muted)]">
                  {"Andere Kanzlei-KI"}
                </th>
                <th className="brand-text px-5 py-4 font-semibold [background:color-mix(in_srgb,var(--brand-primary)_6%,transparent)]">
                  Subsumio SuperBrain
                </th>
              </tr>
            </thead>
            <tbody>
              {t.compareRows.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="border-b [border-color:var(--mk-border)] [background:var(--mk-surface)] last:border-0"
                >
                  <td className="px-5 py-4 font-medium [color:var(--mk-text)]">{row.feature}</td>
                  <td className="px-5 py-4 [color:var(--mk-text-muted)]">
                    <div className="flex items-center gap-2">
                      <span className="text-[color:var(--ds-category-rose-text)]">✕</span>
                      {row.others}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium [color:var(--mk-text)] [background:color-mix(in_srgb,var(--brand-primary)_4%,transparent)]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="brand-text shrink-0" />
                      {row.subsumio}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </Section>
  );
}

// ── FINE-TUNING / LEGAL ENGINE ──
