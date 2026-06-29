"use client";

// Animated FAQ accordion — replaces the native <details> with a
// Framer-Motion AnimatePresence height animation for agency-level polish.
// Single-open: opening one item closes the previous one smoothly.

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

export function AnimatedFaqList({
  items,
  tone = "dark",
}: {
  items: readonly { q: string; a: string }[];
  tone?: "dark" | "light" | "slate";
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div data-tone={tone} className="mx-auto max-w-3xl space-y-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={item.q}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
            transition={{ duration: 0.35, delay: i * 0.055 }}
          >
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
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium"
                aria-expanded={isOpen}
                style={{ color: "var(--mk-text)" }}
              >
                <span>{item.q}</span>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="shrink-0"
                >
                  <ChevronDown size={15} style={{ color: "var(--mk-text-subtle)" }} />
                </motion.span>
              </button>

              <motion.div
                key="body"
                initial={false}
                animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
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
          </motion.div>
        );
      })}
    </div>
  );
}
