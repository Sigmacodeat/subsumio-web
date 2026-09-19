"use client";

// Rotating badge — crossfades through an array of eyebrow texts.
// Pauses on hover. Respects prefers-reduced-motion (shows first item statically).

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
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
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- hover only pauses the rotation; it exposes nothing a keyboard user cannot already reach, and reduced-motion users get a static first item anyway.
    <div
      className="mb-7 inline-flex max-w-full items-center gap-3 text-sm font-medium [color:var(--brand-text)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* A hairline instead of a pill: reads as a chapter mark, not a sticker.
          The rotation carries the motion, so nothing else animates here. */}
      <span aria-hidden className="h-px w-8 bg-current opacity-50" />
      {/* h-5 (20px) matches text-sm's 20px line-height; overflow-hidden is
          needed for the slide crossfade and must not clip descenders. */}
      <div className="relative inline-block h-5 max-w-[calc(100vw-7rem)] min-w-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={index}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: EASE.out }}
            className="block max-w-full truncate whitespace-nowrap"
          >
            {items[index]}
          </motion.span>
        </AnimatePresence>
      </div>
      <span aria-hidden className="h-px w-8 bg-current opacity-50" />
    </div>
  );
}
