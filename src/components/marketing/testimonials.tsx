"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import type { Lang } from "@/content/site";
import { EASE } from "./motion-system";
import { TESTIMONIALS } from "./testimonials-data";

export function TestimonialsSection({ lang }: { lang?: Lang } = {}) {
  // No fabricated social proof: render nothing until real, consented
  // testimonials exist in testimonials-data.ts.
  if (TESTIMONIALS.length === 0) return null;
  const isDE = lang !== "en";
  return (
    <section
      data-tone="light"
      className="relative z-10 px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center"
        >
          <div className="mb-5 flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={20}
                className="fill-[color:var(--signal-amber)] text-[color:var(--signal-amber)]"
              />
            ))}
          </div>
          <h2 className="mb-4 [font-family:var(--font-display)] text-[1.75rem] leading-[1.12] font-black tracking-[-0.02em] text-balance [color:var(--mk-text)] md:text-4xl">
            {isDE ? "Was Anwälte über Subsumio sagen" : "What lawyers say about Subsumio"}
          </h2>
          <p className="mx-auto max-w-2xl text-base [color:var(--mk-text-muted)] md:text-lg">
            {isDE
              ? "Echte Stimmen aus Kanzleien in AT, DE und CH."
              : "Real voices from law firms in AT, DE and CH."}
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.author}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: EASE.out }}
              className="rounded-2xl border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-6"
              style={{ boxShadow: "var(--mk-card-shadow)" }}
            >
              <Quote size={24} className="mb-4 text-[color:var(--brand-text)]" aria-hidden />
              <div className="mb-4 flex gap-1">
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Star
                    key={j}
                    size={14}
                    className="fill-[color:var(--signal-amber)] text-[color:var(--signal-amber)]"
                  />
                ))}
              </div>
              <p className="mb-6 text-sm leading-relaxed text-[color:var(--mk-text-muted)]">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="font-semibold text-[color:var(--mk-text)]">{t.author}</p>
                <p className="text-xs text-[color:var(--mk-text-subtle)]">
                  {t.role}
                  {t.firm ? ` · ${t.firm}` : ""}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
