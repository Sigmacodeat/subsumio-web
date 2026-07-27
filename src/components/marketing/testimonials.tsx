"use client";

import { Star, Quote } from "lucide-react";
import { UI_STRINGS, type Lang } from "@/content/site";
import { Reveal, StaggerContainer, StaggerItem } from "./motion-system";
import { H2_CTA_CLASS } from "./chrome";
import { TESTIMONIALS } from "./testimonials-data";

export function TestimonialsSection({ lang }: { lang?: Lang } = {}) {
  // No fabricated social proof: render nothing until real, consented
  // testimonials exist in testimonials-data.ts.
  if (TESTIMONIALS.length === 0) return null;
  const ui = UI_STRINGS[lang ?? "de"];
  return (
    <section
      data-tone="light"
      className="relative z-10 px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-14 text-center">
          <div className="mb-5 flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={20}
                className="fill-[color:var(--signal-amber)] text-[color:var(--signal-amber)]"
              />
            ))}
          </div>
          <h2 className={`${H2_CTA_CLASS} mb-4`}>{ui.testimonialsTitle}</h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
            {ui.testimonialsSub}
          </p>
        </Reveal>

        <StaggerContainer className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <StaggerItem
              key={t.author}
              className="rounded-2xl border border-[color:var(--mk-border)] bg-[color:var(--mk-surface)] p-6 [box-shadow:var(--mk-card-shadow)]"
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
                <p className="text-sm text-[color:var(--mk-text-subtle)]">
                  {t.role}
                  {t.firm ? ` · ${t.firm}` : ""}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
