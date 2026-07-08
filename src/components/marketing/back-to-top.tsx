"use client";

// Back-to-top button — appears after scrolling 600px.
// Smooth scroll with reduced-motion respect. Hidden until needed.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { UI_STRINGS, type Lang } from "@/content/site";

export default function BackToTop({ lang = "en" }: { lang?: Lang }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={scrollToTop}
          aria-label={UI_STRINGS[lang].backToTopAria}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex h-11 w-11 items-center justify-center rounded-full border [border-color:var(--mk-control-border)] [color:var(--mk-text)] shadow-lg shadow-black/20 transition-all [background:var(--mk-surface-2)] hover:[border-color:var(--mk-focus-ring)] hover:[color:var(--brand-text)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none sm:right-8 sm:bottom-8"
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
