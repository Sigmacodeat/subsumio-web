"use client";

// Rotating badge — crossfades through an array of eyebrow texts.
// Pauses on hover. Respects prefers-reduced-motion (shows first item statically).

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE } from "./motion-system";

export default function RotatingBadge({
  items,
  intervalMs = 4000,
}: {
  items: string[];
  intervalMs?: number;
}) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce || paused || items.length <= 1) return;
    const t = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(t);
  }, [reduce, paused, items.length, intervalMs]);

  if (items.length === 0) return null;

  return (
    <div
      className="mb-8 inline-flex items-center gap-2 rounded-full border [border-color:var(--brand-border)] px-3 py-1.5 text-xs font-medium [color:var(--brand-text)] [background:var(--brand-soft)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
      <div className="relative inline-block h-4 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={index}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE.out }}
            className="inline-block whitespace-nowrap"
          >
            {items[index]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
