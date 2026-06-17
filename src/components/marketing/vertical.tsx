"use client";

// Vertical funnel page template — one component, three industries, two languages.

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaMark } from "@/components/brand/logo";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { p, type Lang } from "@/content/site";
import { VERTICALS, type VerticalSlug } from "@/content/verticals";
import { profileForIndustry } from "@/lib/industry-pack";
import { styleForIndustry } from "@/lib/industry-theme";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  Section,
  SectionHeading,
  ICONS,
} from "./chrome";
import LiveDemo from "./live-demo";
import BranchPricing from "./branch-pricing";
import IndustryHeroMotif from "./industry-hero-motif";
import ProductWorkflowShowcase from "./product-workflow-showcase";
import { WhatsAppSpotlight } from "./subsumio-showcase";
import TrustBand from "./trust-band";
import { AnimatedFaqList } from "./animated-faq";

/** Product-line branding (Subsumio, Taxumio, …): same funnel body, branded
 *  hero, and signup deep-links carrying the industry for prefill. */
export interface ProductBrand {
  name: string;
  claim: string;
  poweredBy: string;
  industry: string;
}

function SignatureBand({ industry, lang }: { industry: string; lang: Lang }) {
  const profile = profileForIndustry(industry);
  if (!profile) return null;

  const signature = profile.signature;
  const locale = lang === "de" ? "de" : "en";

  return (
    <section className="relative z-10 px-6 pb-20">
      <div className="max-w-5xl mx-auto relative overflow-hidden rounded-2xl border brand-border [background:color-mix(in_srgb,var(--mk-surface)_90%,transparent)] p-6 md:p-8">
        <div className="absolute inset-y-0 left-0 w-1/2 brand-glow-bg blur-3xl" />
        <div className="relative grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider brand-text mb-3">{profile.brand} signature</p>
            <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)] leading-tight">{signature.title[locale]}</h2>
            <p className="mt-4 text-sm md:text-base [color:var(--mk-text-muted)] leading-relaxed">{signature.proof[locale]}</p>
          </div>
          <div className="grid gap-3">
            {signature.items.map((item) => (
              <div key={item[locale]} className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] px-4 py-3">
                <CheckCircle size={17} className="brand-text shrink-0" />
                <span className="text-sm font-medium [color:var(--mk-text)]">{item[locale]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function VerticalPage({
  lang,
  slug,
  product,
}: {
  lang: Lang;
  slug: VerticalSlug;
  product?: ProductBrand;
}) {
  const t = VERTICALS[lang][slug];
  const industry = product?.industry ?? slug;
  const signupHref = p(lang, product ? `/signup?industry=${product.industry}` : "/signup");
  // Subsumio (the live legal product) has dedicated subpages; other verticals
  // keep their deep content inline. `sub` builds locale-aware subpage links.
  const isSubsumio = industry === "legal";
  const sub = (path: string) => p(lang, `/subsumio${path}`);

  return (
    <div className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang} style={styleForIndustry(industry)}>
      <MarketingBackground />
      <MarketingNav lang={lang} theme="slate" />

      {/* HERO — slate editorial surface for stronger contrast */}
      <Section tone="slate" className="pt-16 pb-24 px-6">
       <div className="max-w-7xl mx-auto text-center relative">
        <IndustryHeroMotif industry={industry} className="absolute inset-0 z-0 opacity-[0.10] hidden md:block" />
        <div className="relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border brand-border brand-soft text-xs brand-text font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-pulse" />
          {product ? product.poweredBy : t.badge}
        </div>
        {product ? (
          <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.08] tracking-tight mb-6">
            {product.name}<br />
            <span className="gradient-text glow-text">{product.claim}</span>
          </h1>
        ) : (
          <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.08] tracking-tight mb-6">
            {t.h1a}<br />
            <span className="gradient-text glow-text">{t.h1b}</span>
          </h1>
        )}
        <p className="text-lg md:text-xl [color:var(--mk-text-muted)] max-w-2xl mx-auto mb-12 leading-relaxed">{t.sub}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
          <Link href={signupHref}>
            <Button size="xl" variant="glow" className="min-w-[220px]">
              {isSubsumio ? <SubsumioMark size={18} tile={false} /> : <SigmaMark size={18} tile={false} />} {t.ctaButton}
            </Button>
          </Link>
          <a href={isSubsumio ? "#pricing" : "#demo"}>
            <Button size="xl" variant="ghost" className="min-w-[200px]">
              {isSubsumio
                ? (lang === "de" ? "Preise ansehen" : "See pricing")
                : (lang === "de" ? "Live ansehen" : "See it live")} <ArrowRight size={18} />
            </Button>
          </a>
        </div>
        <p className="text-xs [color:var(--mk-text-subtle)] mb-4">
          {isSubsumio
            ? (lang === "de"
                ? "14 Tage Reverse Trial · 14 Tage Geld-zurück-Garantie · Keine Kreditkarte erforderlich"
                : "14-day reverse trial · 14-day money-back guarantee · No credit card required")
            : (lang === "de"
                ? "Self-hosted · EU-Cloud · DSGVO-konform · § 203 StGB im Blick"
                : "Self-hosted · EU cloud · GDPR-ready · professional secrecy by design")}
        </p>
        {/* The live demo is a dark spotlight floating on the slate hero */}
        <div id="demo" data-tone="dark" className="max-w-3xl mx-auto scroll-mt-24 rounded-2xl ring-1 ring-white/[0.08] shadow-[0_0_60px_rgba(56,189,248,0.12)]">
          <LiveDemo lang={lang} {...t.demo} />
        </div>
        </div>
       </div>
      </Section>

      {/* WhatsApp-Copilot — the winning USP, front-loaded as a dark spotlight (Subsumio only) */}
      {isSubsumio && (
        <WhatsAppSpotlight lang={lang}>
          <Link href={sub("/whatsapp")} className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold brand-text transition-all hover:gap-2.5">
            {lang === "de" ? "WhatsApp-Copilot im Detail" : "Explore the WhatsApp copilot"} <ArrowRight size={15} />
          </Link>
        </WhatsAppSpotlight>
      )}

      {/* 3-USP signature proof — light */}
      <div data-tone="light" style={{ background: "var(--mk-bg)" }}>
        <SignatureBand industry={industry} lang={lang} />
      </div>

      {/* How it works — light */}
      <div data-tone="light" style={{ background: "var(--mk-bg)" }}>
        <ProductWorkflowShowcase lang={lang} industry={industry} />
      </div>

      {/* Pains — LIGHT section for credibility + contrast rhythm */}
      <Section tone="light" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading title={t.painsTitle} />
          <div className="grid md:grid-cols-3 gap-5">
            {t.pains.map((pain, i) => (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className="p-6 rounded-2xl border [background:var(--mk-surface)] [border-color:var(--mk-border)]"
                style={{ boxShadow: "var(--mk-card-shadow)" }}
              >
                <AlertCircle size={18} className="text-amber-600 mb-4" />
                <h3 className="text-base font-semibold mb-2 [color:var(--mk-text)]">{pain.title}</h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{pain.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Capabilities — Subsumio shows a six-tile preview that links to the
          full /produkt page (keeps the homepage focused); other verticals keep
          their full grid inline. */}
      {isSubsumio ? (
        <Section tone="light" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              badge={lang === "de" ? "Funktionen" : "Capabilities"}
              title={t.featuresTitle}
              sub={lang === "de"
                ? "Von Fristenkontrolle bis Widerspruchserkennung — alles auf eurer Infrastruktur, jede Antwort mit Fundstelle."
                : "From deadline control to contradiction detection — all on your infrastructure, every answer cited."}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {t.features.slice(0, 6).map((f, i) => {
                const Icon = ICONS[f.icon];
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                    whileHover={{ y: -4 }}
                    className="p-6 rounded-2xl border [background:var(--mk-surface)] [border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)] transition-colors"
                    style={{ boxShadow: "var(--mk-card-shadow)" }}
                  >
                    <div className="w-10 h-10 rounded-lg brand-soft border brand-border flex items-center justify-center mb-4">
                      {Icon && <Icon size={18} className="brand-text" />}
                    </div>
                    <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2">{f.title}</h3>
                    <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
            <div className="text-center mt-10">
              <Link href={sub("/produkt")}>
                <Button size="lg" variant="secondary">
                  {lang === "de" ? "Alle Funktionen ansehen" : "See all capabilities"} <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </div>
        </Section>
      ) : (
        <Section tone="light" className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <SectionHeading title={t.featuresTitle} />
            <div className="grid md:grid-cols-2 gap-5">
              {t.features.map((f, i) => {
                const Icon = ICONS[f.icon];
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.4, delay: (i % 2) * 0.1 }}
                    whileHover={{ y: -4 }}
                    className="p-7 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)] transition-colors flex gap-5"
                    style={{ boxShadow: "var(--mk-card-shadow)" }}
                  >
                    <div className="w-10 h-10 rounded-lg brand-soft border brand-border flex items-center justify-center shrink-0">
                      {Icon && <Icon size={18} className="brand-text" />}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold [color:var(--mk-text)] mb-2">{f.title}</h3>
                      <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{f.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      {/* TrustBand — LIGHT section: credibility, security, GDPR */}
      <div data-tone="light" style={{ background: "var(--mk-bg)" }}>
        <TrustBand lang={lang} industry={industry} />
        {isSubsumio && (
          <div className="text-center -mt-6 pb-16">
            <Link href={sub("/sicherheit")} className="inline-flex items-center gap-1.5 text-sm font-semibold brand-text transition-all hover:gap-2.5">
              {lang === "de" ? "Sicherheit & DSGVO im Detail" : "Security & GDPR in depth"} <ArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>

      {/* Proof — LIGHT section with visual flair */}
      <Section tone="light" className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <span
              className="block text-8xl font-serif leading-none mb-2 select-none"
              style={{ color: "var(--signal-blue)", opacity: 0.12 }}
            >
              &ldquo;
            </span>
            <h2 className="text-2xl md:text-3xl font-black mb-5 -mt-6 [color:var(--mk-text)]">
              {t.proofTitle}
            </h2>
            <p className="text-base leading-relaxed max-w-2xl mx-auto [color:var(--mk-text-muted)]">
              {t.proof}
            </p>
          </motion.div>
        </div>
      </Section>

      {/* Pricing — this branch's own tiers (or global fallback) */}
      <Section tone="light" id="pricing" className="py-20 px-6 scroll-mt-20">
        <BranchPricing lang={lang} industry={product?.industry ?? slug} />
      </Section>

      {/* FAQ — animated accordion, light */}
      <Section tone="light" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading title="FAQ" />
          <AnimatedFaqList items={t.faq} tone="light" />
        </div>
      </Section>

      {/* CTA — dark spotlight close */}
      <Section tone="dark" className="py-24 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          {isSubsumio ? <SubsumioMark size={56} className="mx-auto mb-7" /> : <SigmaMark size={64} className="mx-auto mb-8 rounded-[15px] glow-purple" />}
          <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
          <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
          <Link href={signupHref}>
            <Button size="xl" variant="glow">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </Section>

      <MarketingFooter lang={lang} />
    </div>
  );
}
