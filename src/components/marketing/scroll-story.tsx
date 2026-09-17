"use client";

// Pinned scroll story — four steps (Frage → Akte → Fundstelle → Frist).
// Desktop: the visual is sticky while the steps scroll past and drive it.
// Phone / reduced motion: steps stack, each with its own static visual.

import { useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";

import { SCROLL_STORY } from "@/content/site";
import { Section, SectionHeading } from "./primitives";
import ProductDemo, { type DemoScene } from "./product-demo";

const STEPS = SCROLL_STORY.steps;
const SCENES: DemoScene[] = ["frage", "akte", "fundstelle", "frist"];

export default function ScrollStory() {
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
                  className={`w-full border-l-2 py-2 pl-6 text-left transition-[border-color] duration-[var(--ds-duration-normal)] motion-reduce:transition-none ${
                    active === i
                      ? "[border-color:var(--accent-premium)]"
                      : "[border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)]"
                  }`}
                  aria-current={active === i ? "step" : undefined}
                >
                  <span className="mb-2 block font-mono text-xs tracking-[0.14em] [color:var(--mk-text-subtle)] uppercase">
                    Schritt {i + 1} von {STEPS.length}
                  </span>
                  <span
                    className={`block text-2xl font-semibold tracking-[-0.01em] text-balance ${
                      active === i ? "[color:var(--mk-text)]" : "[color:var(--mk-text-muted)]"
                    }`}
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
              <ProductDemo scene={SCENES[active]} />
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
              <ProductDemo scene={SCENES[i]} />
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
