"use client";

// Scroll-pinned dashboard showcase — agency-level 2026 pattern.
// As the user scrolls through a 200vh container, the dashboard stays pinned
// (position: sticky) and gently zooms from 0.88→1 scale while a spring-smoothed
// guided cursor glides to key interaction points. At scroll milestones (35%, 70%)
// the dashboard view transitions (Matters → Brain → Deadlines).
//
// Research-based tuning:
// - useSpring on ALL scroll-linked values (Motion.dev official pattern):
//   stiffness: 100, damping: 30, restDelta: 0.001
// - Scale range 0.88→1 (Apple/Linear standard — 0.72 was too aggressive)
// - Blur max 4px (8px was too blurry, felt broken)
// - Container 200vh (220vh was too long = boring middle section)
// - Ease-out cubic interpolation via intermediate keyframes
// - Cursor positions spring-smoothed for buttery glide
//
// Sources: Motion.dev Scroll Zoom Hero, Motion.dev useSpring docs,
// Froiden UI Zoom Scroll, Maxime Heckel spring physics,
// SaaSFrame 2026 "Immersive Product Previews".
// Respects prefers-reduced-motion (falls back to static auto-cycling reel).

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import DashboardReel from "./dashboard-reel";
import { SectionHeading } from "./chrome";
import type { Lang } from "@/content/site";

// ─── Spring configs (Motion.dev official for scroll-linked) ──────────────
const SPRING_SMOOTH = { stiffness: 100, damping: 30, restDelta: 0.001 };
// Gentler spring for cursor position (slightly more float)
const SPRING_CURSOR = { stiffness: 80, damping: 26, restDelta: 0.001 };

interface ScrollPinnedDashboardProps {
  lang: Lang;
  badge: string;
  title: string;
  sub: string;
}

// Cursor positions per view (percentages of dashboard area)
const CURSOR_POSITIONS = [
  { x: "72%", y: "42%" },
  { x: "74%", y: "87%" },
  { x: "70%", y: "52%" },
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

  // ─── Raw scroll-linked transforms ────────────────────────────────────
  // Scale: 0.88→1 with ease-out via intermediate keyframe at 0.4
  const scaleRaw = useTransform(scrollYProgress, [0, 0.4, 1], [0.88, 1, 1]);
  // Opacity: gentle fade-in
  const opacityRaw = useTransform(scrollYProgress, [0, 0.12, 0.4, 1], [0.4, 0.85, 1, 1]);
  // Y offset: subtle slide-up (24px max — 40 was too much)
  const yRaw = useTransform(scrollYProgress, [0, 0.4, 1], [24, 0, 0]);
  // Blur: 4px→0 (max 4px — 8px was too aggressive)
  const blurRaw = useTransform(
    scrollYProgress,
    [0, 0.25, 0.45],
    ["blur(4px)", "blur(0px)", "blur(0px)"]
  );

  // ─── Spring-smoothed values (buttery scroll-follow) ──────────────────
  const scale = useSpring(scaleRaw, SPRING_SMOOTH);
  const opacity = useSpring(opacityRaw, SPRING_SMOOTH);
  const y = useSpring(yRaw, SPRING_SMOOTH);
  const blur = useSpring(blurRaw, SPRING_SMOOTH);

  // ─── Cursor position (spring-smoothed for glide effect) ──────────────
  const cursorXRaw = useTransform(
    scrollYProgress,
    [0.05, 0.3, 0.35, 0.6, 0.65, 0.9],
    [
      CURSOR_POSITIONS[0].x,
      CURSOR_POSITIONS[0].x,
      CURSOR_POSITIONS[1].x,
      CURSOR_POSITIONS[1].x,
      CURSOR_POSITIONS[2].x,
      CURSOR_POSITIONS[2].x,
    ]
  );
  const cursorYRaw = useTransform(
    scrollYProgress,
    [0.05, 0.3, 0.35, 0.6, 0.65, 0.9],
    [
      CURSOR_POSITIONS[0].y,
      CURSOR_POSITIONS[0].y,
      CURSOR_POSITIONS[1].y,
      CURSOR_POSITIONS[1].y,
      CURSOR_POSITIONS[2].y,
      CURSOR_POSITIONS[2].y,
    ]
  );
  const cursorX = useSpring(cursorXRaw, SPRING_CURSOR);
  const cursorY = useSpring(cursorYRaw, SPRING_CURSOR);

  // Cursor scale: subtle pulse at each milestone (less aggressive)
  const cursorScaleRaw = useTransform(
    scrollYProgress,
    [0.05, 0.28, 0.35, 0.58, 0.65, 0.88],
    [1, 1, 0.92, 1, 0.92, 1]
  );
  const cursorScale = useSpring(cursorScaleRaw, SPRING_CURSOR);

  // Cursor label opacity: show label briefly at each milestone
  const cursorLabelOpacityRaw = useTransform(
    scrollYProgress,
    [0.08, 0.18, 0.25, 0.38, 0.48, 0.55, 0.68, 0.78, 0.85],
    [0, 1, 0, 0, 1, 0, 0, 1, 0]
  );
  const cursorLabelOpacity = useSpring(cursorLabelOpacityRaw, SPRING_SMOOTH);

  // ─── View index: 0 → 1 → 2 at scroll milestones ──────────────────────
  const viewIndexMV = useTransform(scrollYProgress, [0, 0.35, 0.7, 1], [0, 0, 1, 2]);
  const [currentView, setCurrentView] = useState(0);
  useMotionValueEvent(viewIndexMV, "change", (v) => {
    setCurrentView(Math.round(v));
  });

  // ─── Heading fade (spring-smoothed) ──────────────────────────────────
  const headingOpacityRaw = useTransform(scrollYProgress, [0, 0.12, 0.22], [1, 1, 0]);
  const headingYRaw = useTransform(scrollYProgress, [0, 0.22], [0, -20]);
  const headingOpacity = useSpring(headingOpacityRaw, SPRING_SMOOTH);
  const headingY = useSpring(headingYRaw, SPRING_SMOOTH);

  // Scroll hint
  const hintOpacityRaw = useTransform(scrollYProgress, [0, 0.04, 0.08], [0.5, 0.5, 0]);
  const hintOpacity = useSpring(hintOpacityRaw, SPRING_SMOOTH);

  // Reduced motion: render static auto-cycling reel
  if (reduce) {
    return (
      <section className="px-4 py-24 sm:px-6 lg:px-8" aria-label={title}>
        <div className="mx-auto max-w-5xl">
          <SectionHeading badge={badge} title={title} sub={sub} />
          <div
            className="rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/20"
            data-tone="dashboard"
          >
            <DashboardReel lang={lang} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div ref={containerRef} style={{ height: "200vh" }} className="relative">
      {/* Sticky inner — stays pinned while scrolling through 200vh */}
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        {/* Heading — fades out smoothly as you scroll */}
        <motion.div
          style={{ opacity: headingOpacity, y: headingY }}
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
          <div
            className="rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/30"
            data-tone="dashboard"
          >
            <DashboardReel lang={lang} controlledView={currentView} />
          </div>

          {/* Spring-smoothed guided cursor */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-30 flex items-start gap-2"
            style={{
              left: cursorX as MotionValue<string>,
              top: cursorY as MotionValue<string>,
              scale: cursorScale,
              filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.18))",
            }}
          >
            <span
              className="relative mt-0.5 block h-5 w-4"
              style={{
                background:
                  "linear-gradient(145deg, #fff, color-mix(in srgb, var(--brand-text) 40%, #fff))",
                clipPath: "polygon(0 0, 100% 48%, 58% 58%, 78% 100%, 55% 100%, 38% 64%, 0 84%)",
              }}
            >
              <span className="absolute inset-0 rounded-sm border border-white/40" />
            </span>
            <motion.span
              style={{ opacity: cursorLabelOpacity }}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white backdrop-blur-md [background:color-mix(in_srgb,var(--mk-surface)_85%,transparent)]"
            >
              {lang === "en" ? "Click to interact" : "Klicken zum Interagieren"}
            </motion.span>
          </motion.div>
        </motion.div>

        {/* Scroll hint — disappears smoothly after first scroll */}
        <motion.div
          style={{ opacity: hintOpacity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs [color:var(--mk-text-subtle)]"
        >
          <span className="flex items-center gap-1.5">
            {lang === "en" ? "Scroll to explore" : "Scrollen zum Erkunden"}
            <motion.span
              animate={{ y: [0, 4, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              ↓
            </motion.span>
          </span>
        </motion.div>
      </div>
    </div>
  );
}
