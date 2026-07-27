"use client";

// Animated FAQ accordion — replaces the native <details> with a
// Framer-Motion AnimatePresence height animation for agency-level polish.
// Single-open: opening one item closes the previous one smoothly.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { EASE, StaggerContainer, StaggerItem } from "./motion-system";

export function AnimatedFaqList({
  items,
  tone = "dark",
}: {
  items: readonly { q: string; a: string }[];
  tone?: "dark" | "light" | "slate";
}) {
  const [open, setOpen] = useState<number | null>(null);
  const reduce = useReducedMotion();
  // Accordion open/close is a direct response to a click, so it keeps its
  // animation — but reduced-motion users get it instantly instead of a
  // 0.28s height tween.
  const bodyDuration = reduce ? 0 : 0.28;
  const chevronDuration = reduce ? 0 : 0.25;

  return (
    // data-tone stays on a plain wrapper: StaggerContainer does not forward
    // unknown props, and TS waves hyphenated JSX attributes through without a
    // check — so passing it down would have silently dropped the theming.
    <div data-tone={tone}>
      <StaggerContainer className="mx-auto max-w-3xl space-y-3">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <StaggerItem key={item.q}>
              <div
                className={`overflow-hidden rounded-xl border transition-all duration-200 ${
                  isOpen
                    ? "[border-color:var(--mk-border-strong)]"
                    : "[border-color:var(--mk-border)]"
                }`}
                style={{ background: "var(--mk-surface)" }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-6 px-5 py-4 text-left text-sm font-medium"
                  aria-expanded={isOpen}
                  style={{ color: "var(--mk-text)" }}
                >
                  <span>{item.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: chevronDuration, ease: EASE.out }}
                    className="shrink-0"
                  >
                    <ChevronDown size={15} style={{ color: "var(--mk-text-subtle)" }} />
                  </motion.span>
                </button>

                <motion.div
                  key="body"
                  initial={false}
                  animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                  transition={{ duration: bodyDuration, ease: EASE.out }}
                  style={{ overflow: "hidden" }}
                  aria-hidden={!isOpen}
                >
                  <p
                    className="px-5 pb-5 text-sm leading-relaxed"
                    style={{ color: "var(--mk-text-muted)" }}
                  >
                    {item.a}
                  </p>
                </motion.div>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </div>
  );
}
