"use client";

// Per-industry signature hero motif: the branch's domain symbols arranged as a
// small "knowledge constellation" — connected by drawn-in edges, gently
// floating, auto-coloured in the branch accent (--brand-* set by
// styleForIndustry on the page root). Same elegant layout across branches
// (one design language) but a distinct icon set per vertical → each branch has
// its own character without looking generic. Subtle (low opacity) backdrop;
// pointer-events:none; respects prefers-reduced-motion via the page MotionConfig.

import { motion } from "framer-motion";
import {
  Scale,
  Landmark,
  FileText,
  Gavel,
  Stamp,
  CalendarClock,
  Brain,
  Network,
  type LucideIcon,
} from "lucide-react";

// 6 domain glyphs for the legal vertical — Subsumio is legal-only.
const MOTIF: Record<string, LucideIcon[]> = {
  legal: [Scale, Landmark, FileText, Gavel, Stamp, CalendarClock],
};

// Node positions (% of the container) — a loose, asymmetric constellation.
const POS = [
  { x: 16, y: 24 },
  { x: 39, y: 64 },
  { x: 55, y: 20 },
  { x: 73, y: 56 },
  { x: 88, y: 30 },
  { x: 30, y: 84 },
];
const EDGES: [number, number][] = [
  [0, 2],
  [2, 4],
  [2, 3],
  [3, 1],
  [1, 5],
  [0, 1],
  [3, 5],
];

export default function IndustryHeroMotif({
  industry,
  className = "",
}: {
  industry: string;
  className?: string;
}) {
  const icons = MOTIF[industry] ?? [Brain, Network, FileText, Landmark, Gavel, Stamp];

  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      {/* edges */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {EDGES.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={POS[a].x}
            y1={POS[a].y}
            x2={POS[b].x}
            y2={POS[b].y}
            stroke="var(--brand-primary, #455ac4)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.35 }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: "easeOut" }}
          />
        ))}
      </svg>

      {/* glyph nodes */}
      {POS.map((p, i) => {
        const Icon = icons[i % icons.length];
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.09, type: "spring", stiffness: 180 }}
          >
            {/* No perpetual float here: the wrapper in landing.tsx already gives
                this motif scroll-linked parallax, so it moves when the reader
                moves. Drifting on its own on top of that was ambient noise
                competing with the proof card for attention. */}
            <div
              className="flex items-center justify-center rounded-2xl border"
              style={{
                width: 52,
                height: 52,
                color: "var(--brand-secondary, #7282d5)",
                borderColor: "color-mix(in srgb, var(--brand-primary, #455ac4) 30%, transparent)",
                background: "color-mix(in srgb, var(--brand-primary, #455ac4) 8%, transparent)",
              }}
            >
              {Icon && <Icon size={22} strokeWidth={1.6} />}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
