"use client";

// Scroll-pinned dashboard showcase — agency-level 2026 pattern.
// As the user scrolls through a tall (200vh) container, the dashboard
// stays pinned (position: sticky) and zooms from 0.7→1 scale while a
// guided cursor moves to key interaction points. At scroll milestones
// (33%, 66%) the dashboard view transitions (Matters → Brain → Deadlines).
//
// Research: Motion.dev Scroll Zoom Hero, Froiden UI Zoom Scroll,
// Olivier Larose Zoom Parallax, SaaSFrame 2026 "Immersive Product Previews".
// Respects prefers-reduced-motion (falls back to static auto-cycling reel).

import { useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent, type MotionValue } from "framer-motion";
import DashboardReel from "./dashboard-reel";
import { SectionHeading } from "./chrome";
import type { Lang } from "@/content/site";

interface ScrollPinnedDashboardProps {
  lang: Lang;
  badge: string;
  title: string;
  sub: string;
}

// Cursor positions per view (percentages of dashboard area)
const CURSOR_POSITIONS = [
  { x: "72%", y: "42%", label: "" },
  { x: "74%", y: "87%", label: "" },
  { x: "70%", y: "52%", label: "" },
];

export default function ScrollPinnedDashboard({
  lang,
  badge,
  title,
  sub,
}: ScrollPinnedDashboardProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Scale: dashboard grows from 0.7 to 1 as you scroll
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.72, 1, 1]);
  // Opacity: fade in during first half
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.5, 1], [0.3, 0.8, 1, 1]);
  // Y offset: slide up slightly
  const y = useTransform(scrollYProgress, [0, 0.5, 1], [40, 0, 0]);
  // Blur: clear up as it zooms in
  const blur = useTransform(scrollYProgress, [0, 0.3, 0.5], ["blur(8px)", "blur(0px)", "blur(0px)"]);

  // Cursor X/Y: scroll-linked position changes at milestones
  const cursorX = useTransform(
    scrollYProgress,
    [0.05, 0.25, 0.33, 0.55, 0.66, 0.88],
    [CURSOR_POSITIONS[0].x, CURSOR_POSITIONS[0].x, CURSOR_POSITIONS[1].x, CURSOR_POSITIONS[1].x, CURSOR_POSITIONS[2].x, CURSOR_POSITIONS[2].x],
  );
  const cursorY = useTransform(
    scrollYProgress,
    [0.05, 0.25, 0.33, 0.55, 0.66, 0.88],
    [CURSOR_POSITIONS[0].y, CURSOR_POSITIONS[0].y, CURSOR_POSITIONS[1].y, CURSOR_POSITIONS[1].y, CURSOR_POSITIONS[2].y, CURSOR_POSITIONS[2].y],
  );

  // Cursor scale: pulse at each milestone
  const cursorScale = useTransform(
    scrollYProgress,
    [0.05, 0.22, 0.28, 0.33, 0.50, 0.56, 0.66, 0.83, 0.89],
    [1, 1, 0.88, 1.08, 1, 0.88, 1.08, 1, 0.88],
  );

  // Cursor label opacity: show label briefly at each milestone
  const cursorLabelOpacity = useTransform(
    scrollYProgress,
    [0.05, 0.15, 0.22, 0.33, 0.43, 0.50, 0.66, 0.76, 0.83],
    [0, 1, 0, 0, 1, 0, 0, 1, 0],
  );

  // View index: 0 → 1 → 2 at scroll milestones
  const viewIndexMV = useTransform(scrollYProgress, [0, 0.33, 0.66, 1], [0, 0, 1, 2]);
  const [currentView, setCurrentView] = useState(0);
  useMotionValueEvent(viewIndexMV, "change", (v) => {
    setCurrentView(Math.round(v));
  });

  // Reduced motion: render static auto-cycling reel
  if (reduce) {
    return (
      <section className="px-4 py-24 sm:px-6 lg:px-8" aria-label={title}>
        <div className="mx-auto max-w-5xl">
          <SectionHeading badge={badge} title={title} sub={sub} />
          <div className="rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/20" data-tone="dashboard">
            <DashboardReel lang={lang} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div ref={containerRef} style={{ height: "220vh" }} className="relative">
      {/* Sticky inner — stays pinned while scrolling through 220vh */}
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        {/* Heading — fades out as you scroll */}
        <motion.div
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.15, 0.25], [1, 1, 0]),
            y: useTransform(scrollYProgress, [0, 0.25], [0, -30]),
          }}
          className="mb-8 px-4 text-center"
        >
          <SectionHeading badge={badge} title={title} sub={sub} />
        </motion.div>

        {/* Dashboard — zooms in as you scroll */}
        <motion.div
          style={{
            scale,
            opacity,
            y,
            filter: blur as MotionValue<string>,
            transformOrigin: "center center",
            willChange: "transform, filter, opacity",
          }}
          className="relative w-full max-w-5xl px-4"
        >
          <div className="rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/30" data-tone="dashboard">
            <DashboardReel lang={lang} controlledView={currentView} />
          </div>

          {/* Scroll-linked guided cursor */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-30 flex items-start gap-2"
            style={{
              left: cursorX as MotionValue<string>,
              top: cursorY as MotionValue<string>,
              scale: cursorScale,
              filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.22))",
            }}
          >
            <span
              className="relative mt-0.5 block h-5 w-4"
              style={{
                background:
                  "linear-gradient(145deg, #fff, color-mix(in srgb, var(--brand-text) 40%, #fff))",
                clipPath:
                  "polygon(0 0, 100% 48%, 58% 58%, 78% 100%, 55% 100%, 38% 64%, 0 84%)",
              }}
            >
              <span className="absolute inset-0 rounded-sm border border-white/40" />
            </span>
            <motion.span
              style={{ opacity: cursorLabelOpacity }}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white backdrop-blur-md [background:color-mix(in_srgb,#0d0d1a_85%,transparent)]"
            >
              {lang === "en" ? "Click to interact" : "Klicken zum Interagieren"}
            </motion.span>
          </motion.div>
        </motion.div>

        {/* Scroll hint — disappears after first scroll */}
        <motion.div
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.05, 0.1], [0.6, 0.6, 0]),
          }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs [color:var(--mk-text-subtle)]"
        >
          <span className="flex items-center gap-1.5">
            {lang === "en" ? "Scroll to explore" : "Scrollen zum Erkunden"}
            <motion.span
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              ↓
            </motion.span>
          </span>
        </motion.div>
      </div>
    </div>
  );
}
