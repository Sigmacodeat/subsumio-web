"use client";

// Sticky bottom CTA bar — appears after the hero scrolls past and leaves again
// when the closing CTA (`data-closing-cta`) scrolls in. Driven by
// useMotionValueEvent (fires only on scroll change) with a threshold-crossing
// guard so React re-renders at most twice (show/hide), not once per frame —
// keeps INP healthy vs. a raw scroll listener + per-frame setState.

import { useState } from "react";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { useMarket } from "@/lib/use-market";
import { EASE } from "./motion-presets";

export default function StickyCta() {
  const { landing: t, ui, p } = useMarket();
  const { scrollY: globalScrollY } = useScroll();
  const [stickyVisible, setStickyVisible] = useState(false);
  useMotionValueEvent(globalScrollY, "change", (latest) => {
    // Step aside once the closing CTA section is on screen — two identical
    // trial buttons stacked on top of each other is one too many.
    const closing = document.querySelector("[data-closing-cta]");
    const closingInView = closing
      ? closing.getBoundingClientRect().top < window.innerHeight
      : false;
    const shouldShow = latest > 600 && !closingInView;
    setStickyVisible((prev) => (prev === shouldShow ? prev : shouldShow));
  });

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: stickyVisible ? 1 : 0,
        y: stickyVisible ? 0 : 60,
        pointerEvents: stickyVisible ? "auto" : "none",
      }}
      transition={{ duration: 0.3, ease: EASE.out }}
      data-tone="dark"
      className="fixed right-0 bottom-0 left-0 z-50 border-t [border-color:var(--mk-border)] pb-[env(safe-area-inset-bottom)] backdrop-blur-lg [background:color-mix(in_srgb,var(--mk-surface)_92%,transparent)]"
      aria-hidden={!stickyVisible}
      {...(!stickyVisible ? { inert: true } : {})}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <SubsumioMark size={24} />
          <span className="text-sm font-semibold [color:var(--mk-text)]">{ui.trySubsumio}</span>
          <span className="hidden text-sm [color:var(--mk-text-muted)] sm:inline">
            {ui.trialDaysFree}
          </span>
        </div>
        <Button size="md" variant="primary" asChild>
          <Link href={p("/signup")}>
            {t.ctaPrimary} <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
