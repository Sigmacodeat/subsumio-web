"use client";

// Pinned scroll story — four steps (Frage → Akte → Fundstelle → Frist).
// Desktop: the visual is sticky while the steps scroll past and drive it.
// Phone / reduced motion: steps stack, each with its own static visual.

import { useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from "framer-motion";
import {
  BookOpen,
  CalendarClock,
  Check,
  FileText,
  Mail,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

import { HERO_DEMO, SCROLL_STORY } from "@/content/site";
import { Section, SectionHeading } from "./primitives";
import { EASE } from "./motion-system";

const STEPS = SCROLL_STORY.steps;

export default function ScrollStory() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [active, setActive] = useState(0);
  // Drive the pinned visual by whichever step sits closest to the viewport
  // centre — robust against header height, step height and scroll speed.
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", () => {
    const mid = window.innerHeight * 0.5;
    let best = 0;
    let bestDist = Infinity;
    stepRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    if (best !== active) setActive(best);
  });

  return (
    <Section tone="light" id="so-arbeitet-subsumio" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          badge={SCROLL_STORY.eyebrow}
          title={SCROLL_STORY.title}
          sub={SCROLL_STORY.sub}
        />

        {/* Desktop: sticky visual + scrolling steps */}
        <div
          ref={ref}
          className="mt-14 hidden gap-12 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <ol className="m-0 list-none p-0">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className="flex min-h-[70vh] items-center"
              >
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={`w-full border-l-2 py-2 pl-6 text-left transition-[border-color,opacity] duration-[var(--ds-duration-normal)] motion-reduce:transition-none ${
                    active === i
                      ? "[border-color:var(--accent-premium)] opacity-100"
                      : "[border-color:var(--mk-border)] opacity-45 hover:opacity-80"
                  }`}
                  aria-current={active === i ? "step" : undefined}
                >
                  <span className="mb-2 block font-mono text-xs tracking-[0.14em] [color:var(--mk-text-subtle)] uppercase">
                    Schritt {i + 1} von {STEPS.length}
                  </span>
                  <span
                    className="block text-2xl font-semibold tracking-[-0.01em] text-balance [color:var(--mk-text)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {s.title}
                  </span>
                  <span className="mt-3 block max-w-md text-base leading-relaxed [color:var(--mk-text-muted)]">
                    {s.text}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="relative">
            <div className="sticky top-[calc(var(--header-h,56px)+6vh)]">
              <StoryVisual step={active} animate={!reduce} />
            </div>
          </div>
        </div>

        {/* Phone / tablet: stacked */}
        <ol className="mt-12 grid list-none gap-10 p-0 lg:hidden">
          {STEPS.map((s, i) => (
            <li key={s.key} className="grid gap-4">
              <div className="border-l-2 [border-color:var(--accent-premium)] pl-4">
                <span className="mb-1 block font-mono text-[11px] tracking-[0.14em] [color:var(--mk-text-subtle)] uppercase">
                  Schritt {i + 1} von {STEPS.length}
                </span>
                <h3
                  className="m-0 text-xl font-semibold tracking-[-0.01em] [color:var(--mk-text)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {s.title}
                </h3>
                <p className="mt-2 mb-0 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {s.text}
                </p>
              </div>
              <StoryVisual step={i} animate={false} />
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ── Visual: one card whose content is swapped per step ─────────────────── */

function StoryVisual({ step, animate }: { step: number; animate: boolean }) {
  const d = HERO_DEMO;
  const enter = animate
    ? {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: EASE.out },
      }
    : {};
  return (
    <div
      className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]"
      style={{ boxShadow: "var(--ds-shadow-3)" }}
      aria-live="polite"
    >
      <div className="flex items-center justify-between border-b [border-color:var(--mk-border)] px-4 py-2.5 text-xs [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]">
        <span className="truncate">
          Akte {d.matterNumber} · {d.matter}
        </span>
        <span className="font-mono tracking-wide uppercase">{STEPS[step].key}</span>
      </div>
      <div className="min-h-[300px] p-5">
        {step === 0 && (
          <motion.div key="s0" {...enter} className="grid gap-4">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white [background:var(--brand-primary)]">
                {d.question}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm [color:var(--mk-text-muted)]">
              <MessageSquare size={14} className="text-[var(--brand-secondary)]" />
              Kontext: Akte {d.matterNumber}, Zivilverfahren, Landesgericht
            </div>
            <div className="mt-2 grid gap-2">
              {[
                "Welche Fristen sind in dieser Akte offen?",
                "Fasse den Stand des Verfahrens zusammen.",
                "Welche Beweise fehlen noch?",
              ].map((q) => (
                <span
                  key={q}
                  className="rounded-lg border [border-color:var(--mk-border)] px-3 py-2 text-xs [color:var(--mk-text-muted)]"
                >
                  {q}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" {...enter} className="grid gap-2">
            {[
              {
                name: "Klage_Zustellnachweis.pdf",
                meta: "Zustellung 16.09.2026 · 2 Seiten",
                hit: true,
                icon: FileText,
              },
              {
                name: "Klage_Novak_v_Versicherung.pdf",
                meta: "Klagsschrift · 14 Seiten",
                hit: true,
                icon: FileText,
              },
              {
                name: "Mandatsannahme_Novak.pdf",
                meta: "Vollmacht · 3 Seiten",
                hit: false,
                icon: FileText,
              },
              {
                name: "E-Mail: Gegnerkorrespondenz",
                meta: "Versicherung AG · 4 Nachrichten",
                hit: false,
                icon: Mail,
              },
              {
                name: "Polizzen_Auszug.pdf",
                meta: "Beilage ./B · 6 Seiten",
                hit: false,
                icon: FileText,
              },
            ].map((f) => (
              <div
                key={f.name}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  f.hit
                    ? "[border-color:color-mix(in_srgb,var(--brand-primary)_35%,transparent)] [background:color-mix(in_srgb,var(--brand-primary)_8%,transparent)]"
                    : "[border-color:var(--mk-border)] opacity-70"
                }`}
              >
                <f.icon
                  size={16}
                  className={
                    f.hit ? "text-[var(--brand-secondary)]" : "[color:var(--mk-text-subtle)]"
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium [color:var(--mk-text)]">{f.name}</div>
                  <div className="text-xs [color:var(--mk-text-muted)]">{f.meta}</div>
                </div>
                {f.hit && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white [background:var(--brand-primary)]">
                    relevant
                  </span>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" {...enter} className="grid gap-4">
            <div className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface-2)]">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium [color:var(--mk-text-muted)]">
                <BookOpen size={13} className="text-[var(--accent-premium)]" /> § 243 Abs. 1 ZPO ·
                RIS, geltende Fassung
              </div>
              <p className="m-0 text-sm leading-relaxed [color:var(--mk-text)]">
                Die Klagebeantwortung ist{" "}
                <mark className="rounded-sm px-0.5 [color:inherit] [background:color-mix(in_srgb,var(--accent-premium)_32%,transparent)]">
                  binnen vier Wochen
                </mark>{" "}
                nach Zustellung der Klage beim Prozessgericht einzubringen.
              </p>
            </div>
            <div className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface-2)]">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium [color:var(--mk-text-muted)]">
                <FileText size={13} className="text-[var(--brand-secondary)]" />{" "}
                Klage_Zustellnachweis.pdf · S. 2
              </div>
              <p className="m-0 text-sm leading-relaxed [color:var(--mk-text)]">
                Übernahmebestätigung:{" "}
                <mark className="rounded-sm px-0.5 [color:inherit] [background:color-mix(in_srgb,var(--accent-premium)_32%,transparent)]">
                  zugestellt am 16.09.2026
                </mark>
                , Empfänger: Kanzlei, ohne Vorbehalt.
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium [color:var(--mk-text-muted)]">
              <ShieldCheck size={13} className="text-[var(--brand-secondary)]" /> {d.verified}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="s3" {...enter} className="grid gap-3">
            <div className="text-xs font-semibold tracking-wide [color:var(--mk-text-subtle)] uppercase">
              Fristenbuch · Akte {d.matterNumber}
            </div>
            {[
              { title: "Vorfrist Klagebeantwortung", date: "07.10.2026", tone: "soft" },
              { title: "Klagebeantwortung (Notfrist)", date: "14.10.2026", tone: "gold" },
              { title: "Vorbereitende Tagsatzung", date: "03.12.2026", tone: "muted" },
            ].map((r) => (
              <div
                key={r.title}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  r.tone === "gold"
                    ? "[border-color:color-mix(in_srgb,var(--accent-premium)_45%,transparent)] [background:color-mix(in_srgb,var(--accent-premium)_10%,transparent)]"
                    : "[border-color:var(--mk-border)]"
                } ${r.tone === "muted" ? "opacity-70" : ""}`}
              >
                <div className="flex items-center gap-2.5">
                  <CalendarClock
                    size={15}
                    className={
                      r.tone === "gold"
                        ? "text-[var(--accent-premium)]"
                        : "[color:var(--mk-text-subtle)]"
                    }
                  />
                  <span className="font-medium [color:var(--mk-text)]">{r.title}</span>
                </div>
                <span className="font-mono text-xs [color:var(--mk-text-muted)] tabular-nums">
                  {r.date}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2 text-xs [color:var(--mk-text-muted)]">
              <Check size={13} className="text-[var(--brand-secondary)]" /> Bestätigt von Mag. Huber
              · 17.09.2026, 09:12
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
