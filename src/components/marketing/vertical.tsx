"use client";

// Vertical funnel page template — one component, three industries, two languages.

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { p, type Lang } from "@/content/site";
import { VERTICALS, type VerticalSlug } from "@/content/verticals";
import { profileForIndustry } from "@/lib/industry-pack";
import { styleForIndustry } from "@/lib/industry-theme";
import { Section, SectionHeading, ICONS } from "./chrome";
import LiveDemo from "./live-demo";
import BranchPricing from "./branch-pricing";
import IndustryHeroMotif from "./industry-hero-motif";
import ProductWorkflowShowcase from "./product-workflow-showcase";
import { WhatsAppSpotlight } from "./subsumio-showcase";
import { AnimatedFaqList } from "./animated-faq";

/** Subsumio product branding — funnel body, hero, and signup deep-links. */
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
      <div className="brand-border relative mx-auto max-w-5xl overflow-hidden rounded-2xl border p-6 [background:var(--mk-surface)] md:p-8">
        <div className="brand-glow-bg absolute inset-y-0 left-0 w-1/2 blur-3xl" />
        <div className="relative grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <p className="brand-text mb-3 font-mono text-xs tracking-wider uppercase">
              {profile.brand} signature
            </p>
            <h2 className="text-2xl leading-tight font-black [color:var(--mk-text)] md:text-3xl">
              {signature.title[locale]}
            </h2>
            <p className="mt-4 text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
              {signature.proof[locale]}
            </p>
          </div>
          <div className="grid gap-3">
            {signature.items.map((item) => (
              <div
                key={item[locale]}
                className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]"
              >
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
    <div
      data-tone="slate"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
      style={styleForIndustry(industry)}
    >
      {/* HERO — slate editorial surface for stronger contrast */}
      <Section tone="slate" className="px-6 pt-16 pb-24">
        <div className="relative mx-auto max-w-7xl text-center">
          <IndustryHeroMotif
            industry={industry}
            className="absolute inset-0 z-0 hidden opacity-[0.10] md:block"
          />
          <div className="relative z-10">
            <div className="brand-border brand-soft brand-text mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
              <span className="badge-pulse h-1.5 w-1.5 rounded-full bg-[var(--brand-secondary)]" />
              {product ? product.poweredBy : t.badge}
            </div>
            {product ? (
              <h1 className="mb-6 text-4xl leading-[1.08] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
                {product.name}
                <br />
                <span className="gradient-text glow-text">{product.claim}</span>
              </h1>
            ) : (
              <h1 className="mb-6 text-4xl leading-[1.08] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
                {t.h1a}
                <br />
                <span className="gradient-text glow-text">{t.h1b}</span>
              </h1>
            )}
            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)] md:text-xl">
              {t.sub}
            </p>
            <div className="mb-4 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href={signupHref}>
                <Button size="xl" variant="glow" className="min-w-[220px]">
                  <SubsumioMark size={18} tile={false} /> {t.ctaButton}
                </Button>
              </Link>
              <a href={isSubsumio ? "#pricing" : "#demo"}>
                <Button size="xl" variant="ghost" className="min-w-[200px]">
                  {isSubsumio
                    ? lang === "de"
                      ? "Preise ansehen"
                      : "See pricing"
                    : lang === "de"
                      ? "Live ansehen"
                      : "See it live"}{" "}
                  <ArrowRight size={18} />
                </Button>
              </a>
            </div>
            <p className="mb-4 text-xs [color:var(--mk-text-subtle)]">
              {isSubsumio
                ? lang === "de"
                  ? "14 Tage Reverse Trial · 14 Tage Geld-zurück-Garantie · Keine Kreditkarte erforderlich"
                  : "14-day reverse trial · 14-day money-back guarantee · No credit card required"
                : lang === "de"
                  ? "Self-hosted · EU-Cloud · DSGVO-konform · § 203 StGB im Blick"
                  : "Self-hosted · EU cloud · GDPR-ready · professional secrecy by design"}
            </p>
            {/* The live demo is a dark spotlight floating on the slate hero */}
            <div
              id="demo"
              data-tone="dark"
              className="mx-auto max-w-3xl scroll-mt-24 rounded-2xl shadow-[0_0_60px_rgba(56,189,248,0.12)] ring-1 ring-white/[0.08]"
            >
              <LiveDemo lang={lang} {...t.demo} />
            </div>
          </div>
        </div>
      </Section>

      {/* WhatsApp-Copilot — the winning USP, front-loaded as a dark spotlight (Subsumio only) */}
      {isSubsumio && (
        <WhatsAppSpotlight lang={lang}>
          <Link
            href={sub("/whatsapp")}
            className="brand-text mt-8 inline-flex items-center gap-1.5 text-sm font-semibold transition-all hover:gap-2.5"
          >
            {lang === "de" ? "WhatsApp-Copilot im Detail" : "Explore the WhatsApp copilot"}{" "}
            <ArrowRight size={15} />
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
      <Section tone="light" className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={t.painsTitle} />
          <div className="grid gap-5 md:grid-cols-3">
            {t.pains.map((pain, i) => (
              <motion.div
                key={pain.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                whileHover={{ y: -4 }}
                className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]"
                style={{ boxShadow: "var(--mk-card-shadow)" }}
              >
                <AlertCircle size={18} className="mb-4 text-amber-600" />
                <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                  {pain.title}
                </h3>
                <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{pain.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Capabilities — Subsumio shows a six-tile preview that links to the
          full /subsumio page (keeps the homepage focused); other verticals keep
          their full grid inline. */}
      {isSubsumio ? (
        <Section tone="light" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              badge={lang === "de" ? "Funktionen" : "Capabilities"}
              title={t.featuresTitle}
              sub={
                lang === "de"
                  ? "Von Fristenkontrolle bis Widerspruchserkennung — alles auf deiner Infrastruktur, jede Antwort mit Fundstelle."
                  : "From deadline control to contradiction detection — all on your infrastructure, every answer cited."
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    className="rounded-2xl border [border-color:var(--mk-border)] p-6 transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
                    style={{ boxShadow: "var(--mk-card-shadow)" }}
                  >
                    <div className="brand-soft brand-border mb-4 flex h-10 w-10 items-center justify-center rounded-lg border">
                      {Icon && <Icon size={18} className="brand-text" />}
                    </div>
                    <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                      {f.title}
                    </h3>
                    <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
            <div className="mt-10 text-center">
              <Link href={p(lang, "/subsumio")}>
                <Button size="lg" variant="secondary">
                  {lang === "de" ? "Alle Funktionen ansehen" : "See all capabilities"}{" "}
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </div>
        </Section>
      ) : (
        <Section tone="light" className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading title={t.featuresTitle} />
            <div className="grid gap-5 md:grid-cols-2">
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
                    className="flex gap-5 rounded-xl border [border-color:var(--mk-border)] p-7 transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
                    style={{ boxShadow: "var(--mk-card-shadow)" }}
                  >
                    <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border">
                      {Icon && <Icon size={18} className="brand-text" />}
                    </div>
                    <div>
                      <h3 className="mb-2 text-base font-semibold [color:var(--mk-text)]">
                        {f.title}
                      </h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                        {f.desc}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      {/* Proof — LIGHT section with visual flair */}
      <Section tone="light" className="px-6 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <span
              className="mb-2 block font-serif text-8xl leading-none select-none"
              style={{ color: "var(--signal-blue)", opacity: 0.12 }}
            >
              &ldquo;
            </span>
            <h2 className="-mt-6 mb-5 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.proofTitle}
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)]">
              {t.proof}
            </p>
          </motion.div>
        </div>
      </Section>

      {/* Security link — compact bridge to /security (Subsumio only) */}
      {isSubsumio && (
        <div className="pb-16 text-center">
          <Link
            href={p(lang, "/security")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-semibold transition-all hover:gap-2.5"
          >
            {lang === "de" ? "Sicherheit & DSGVO im Detail" : "Security & GDPR in depth"}{" "}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* Pricing — this branch's own tiers (or global fallback) */}
      <Section tone="light" id="pricing" className="scroll-mt-20 px-6 py-20">
        <BranchPricing lang={lang} industry={product?.industry ?? slug} />
      </Section>

      {/* FAQ — animated accordion, light */}
      <Section tone="light" className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title="FAQ" />
          <AnimatedFaqList items={t.faq} tone="light" />
        </div>
      </Section>

      {/* CTA — dark spotlight close */}
      <Section tone="dark" className="px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <SubsumioMark size={56} className="mx-auto mb-7" />
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {t.ctaTitle}
          </h2>
          <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{t.ctaSub}</p>
          <Link href={signupHref}>
            <Button size="xl" variant="glow">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </div>
      </Section>
    </div>
  );
}
