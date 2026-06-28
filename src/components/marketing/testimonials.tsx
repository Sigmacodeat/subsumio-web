"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";
import { EASE } from "./motion-system";

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  firm?: string;
  rating: number;
  date: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Subsumio findet in Sekunden, was ich sonst 20 Minuten in Aktenordnern gesucht hätte. Jede Antwort mit Fundstelle — das ist der Unterschied.",
    author: "Dr. M. Bauer",
    role: "Rechtsanwältin",
    firm: "Kanzlei Bauer & Partner",
    rating: 5,
    date: "2026-05-15",
  },
  {
    quote:
      "Die Fristenkontrolle hat uns bereits zweimal vor einer versäumten Notfrist bewahrt. Das allein rechtfertigt den Preis.",
    author: "Dr. T. Hoffmann",
    role: "Partner",
    firm: "Hoffmann & Kollegen",
    rating: 5,
    date: "2026-05-28",
  },
  {
    quote:
      "Endlich eine KI, die nicht halluziniert. Wenn die Akte keine Antwort hat, sagt Subsumio das — statt etwas zu erfinden.",
    author: "Dr. S. Klein",
    role: "Einzelanwältin",
    rating: 5,
    date: "2026-06-03",
  },
];

export function TestimonialsSection() {
  return (
    <section
      data-tone="slate"
      className="relative z-10 px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
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
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            Was Anwälte über Subsumio sagen
          </h2>
          <p className="mx-auto max-w-2xl text-lg [color:var(--mk-text-muted)]">
            Echte Stimmen aus Kanzleien in AT, DE und CH.
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.author}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
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

export { TESTIMONIALS };
