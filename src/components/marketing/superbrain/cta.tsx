"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p } from "@/content/site";
import { EASE, ClipReveal, MagneticButton, GradientMesh } from "../motion-system";
import { Section } from "../primitives";
import { H2_CTA_CLASS } from "../typography";
import SharedStickyCta from "../sticky-cta";
import { reveal, type SuperbrainCopyDe } from "./shared";

/** The floating trial bar — the same one as on the landing page. (A bespoke
 *  pill used to live here: untoned, so its text resolved to the light page's
 *  dark ink on a dark translucent fill.) */
export function StickyCTA(_props: { t: SuperbrainCopyDe }) {
  return <SharedStickyCta />;
}

export function CTASection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section
      tone="dark"
      className="px-4 py-24 sm:px-6 lg:px-8"
      aria-label="Jetzt testen"
      data-closing-cta
    >
      <GradientMesh className="z-0" />
      <div className="brand-glow-bg absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 opacity-30 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
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
