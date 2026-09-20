"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import { ArrowRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p } from "@/content/site";
import { EASE, ClipReveal, MagneticButton, GradientMesh } from "../motion-system";
import { Section, H2_CTA_CLASS } from "../primitives";
import { reveal, type SuperbrainCopyDe } from "./shared";

export function StickyCTA({ t }: { t: SuperbrainCopyDe }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (useReducedMotion()) return null;
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 100, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3, ease: EASE.out }}
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4 pb-[env(safe-area-inset-bottom)]"
      aria-hidden={!visible}
      {...(!visible ? { inert: true } : {})}
    >
      <Link href={p("/signup")}>
        <div className="brand-border-strong brand-soft-strong flex items-center gap-3 rounded-full border px-5 py-3 shadow-2xl backdrop-blur-md">
          <span className="text-sm font-bold [color:var(--mk-text)]">{t.stickyCtaText}</span>
          <span className="hidden text-sm [color:var(--mk-text-muted)] sm:inline">
            {t.stickyCtaHint}
          </span>
          <ArrowRight size={16} className="brand-text" />
        </div>
      </Link>
    </motion.div>
  );
}

export function CTASection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="dark" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="Jetzt testen">
      <GradientMesh className="z-0" />
      <div className="brand-glow-bg absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 opacity-30 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, ease: EASE.dramatic }}
          className="mb-8 flex justify-center"
        >
          <div className="brand-soft-strong brand-border-strong flex h-20 w-20 items-center justify-center rounded-2xl border">
            <Brain size={36} className="brand-text" />
          </div>
        </motion.div>
        <ClipReveal>
          <h2 className={`mb-5 ${H2_CTA_CLASS}`}>{t.ctaTitle}</h2>
        </ClipReveal>
        <motion.p
          {...reveal}
          className="mb-10 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
        >
          {t.ctaSub}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <MagneticButton strength={0.3}>
            <Button size="lg" className="gap-2" asChild>
              <Link href={p("/signup")}>
                {t.ctaButton} <ArrowRight size={18} />
              </Link>
            </Button>
          </MagneticButton>
          <Button size="lg" variant="secondary" asChild>
            <Link href={p("/contact")}>{t.ctaContact}</Link>
          </Button>
        </motion.div>
      </div>
    </Section>
  );
}
