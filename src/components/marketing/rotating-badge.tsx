"use client";

// Rotating badge — crossfades through an array of eyebrow texts.
// Pauses on hover. Respects prefers-reduced-motion (shows first item statically).

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
      <motion.span
        key={index}
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE.out }}
        className="inline-block"
      >
        {items[index]}
      </motion.span>
    </div>
  );
}
