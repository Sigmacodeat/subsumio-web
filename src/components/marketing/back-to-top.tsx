"use client";

// Back-to-top button — appears after scrolling 600px.
// Smooth scroll with reduced-motion respect. Hidden until needed.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { UI_STRINGS } from "@/content/site";

export default function BackToTop({ lang = "en" }: { lang?: "en" | "de" }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
          className="fixed bottom-8 right-8 z-50 w-11 h-11 rounded-full [background:var(--mk-surface-2)] border [border-color:var(--mk-border)] shadow-lg shadow-black/20 flex items-center justify-center [color:var(--mk-text)] hover:[color:var(--brand-primary)] hover:[border-color:var(--brand-primary)]/40 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/50"
        >
          <ArrowUp size={18} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
