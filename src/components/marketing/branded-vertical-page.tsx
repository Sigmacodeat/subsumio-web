"use client";

// Branded vertical page — one agency-grade template, content-driven, reused by
// every product brand (Taxumio, Compliumio, …). Sells the daily workflow and
// links to the real dashboard tools. Animated cockpit mockup, day timeline,
// tool grid, brain demo. Decorative motion respects prefers-reduced-motion.
//
// The content shape is BrandedVerticalContent (defined alongside TAXUMIO in
// content/taxumio.ts and reused by content/compliance.ts).

import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import {
  ArrowRight,
  Check,
  CalendarClock,
  FileSignature,
  Scale,
  Calculator,
  FileSpreadsheet,
  Shield,
  ShieldCheck,
  Building2,
  Briefcase,
  Layers,
  Users,
  Network,
  Landmark,
  FileText,
  Brain,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaMark } from "@/components/brand/logo";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { TaxumioMark } from "@/components/brand/taxumio-logo";
import { p, type Lang } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { styleForIndustry } from "@/lib/industry-theme";
import type { BrandedVerticalContent } from "@/content/taxumio";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
  ICONS,
} from "./chrome";
import LiveDemo from "./live-demo";
import BranchPricing from "./branch-pricing";
import IndustryHeroMotif from "./industry-hero-motif";
import ProductWorkflowShowcase from "./product-workflow-showcase";
import DashboardReel from "./dashboard-reel";
import { StaggerContainer, StaggerItem, Reveal } from "./motion-system";

const viewport = { once: true, margin: "-60px" } as const;

const SIGNATURE_ICONS: Record<string, LucideIcon> = {
  Brain,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  Check,
  FileSpreadsheet,
  FileText,
  Landmark,
  Layers,
  Network,
  Scale,
  Shield,
  ShieldCheck,
  ShieldAlert: ICONS.ShieldAlert,
  Users,
};

function SignatureBand({
  industry,
  lang,
}: {
  industry: string;
  lang: Lang;
}) {
  const profile = profileForIndustry(industry);
  if (!profile) return null;

  const iconMap: Record<string, string[]> = {
    legal: ["Scale", "CalendarClock", "FileText"],
    tax: ["Calculator", "FileSpreadsheet", "Shield"],
    compliance: ["ShieldAlert", "FileText", "Check"],
    insurance: ["ShieldCheck", "CalendarClock", "Users"],
    realestate: ["Building2", "FileText", "CalendarClock"],
    vc: ["Landmark", "Network", "FileText"],
    consulting: ["Briefcase", "Layers", "Users"],
    recruiting: ["Users", "Network", "FileText"],
    medical: ["Shield", "FileText", "CalendarClock"],
  };
  const icons = iconMap[industry] ?? ["Brain", "Network", "FileText"];

  return (
    <section className="relative z-10 py-28 px-6 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]"
      >
        <div className="absolute inset-0 opacity-35" aria-hidden>
          <div className="absolute inset-y-0 left-0 w-1/2 brand-glow-bg blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand-primary)_16%,transparent)_0_1px,transparent_1px_28px)]" />
        </div>
        <div className="relative grid lg:grid-cols-[1.15fr_1fr] gap-6 p-6 md:p-8 items-center">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider brand-text mb-3">
              {profile.brand} signature
            </p>
            <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)] mb-3">
              {profile.signature.title[lang]}
            </h2>
            <p className="text-sm md:text-base text-[#a8a8be] leading-relaxed max-w-2xl">
              {profile.signature.proof[lang]}
            </p>
          </div>
          <div className="grid sm:grid-cols-3 lg:grid-cols-1 gap-3">
            {profile.signature.items.map((item, i) => {
              const Icon = SIGNATURE_ICONS[icons[i]];
              return (
                <div key={item.en} className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] [background:color-mix(in_srgb,var(--mk-bg)_55%,transparent)] p-3">
                  <div className="w-9 h-9 rounded-lg brand-soft border brand-border flex items-center justify-center shrink-0">
                    {Icon && <Icon size={16} className="brand-text" />}
                  </div>
                  <span className="text-sm font-semibold [color:var(--mk-text)]">{item[lang]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Cockpit({ c }: { c: BrandedVerticalContent["cockpit"] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      className="relative mx-auto w-full max-w-[420px]"
    >
      <div className="absolute -inset-8 brand-glow-bg blur-3xl rounded-full" />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] shadow-2xl shadow-black/50 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b [border-color:var(--mk-border)]">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          <div className="flex-1 ml-3 text-xs [color:var(--mk-text-subtle)] font-mono">{c.title}</div>
        </div>

        <div className="p-4 space-y-3">
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock size={13} className="brand-text" />
              <span className="text-xs font-semibold [color:var(--mk-text)]">{c.digestLabel}</span>
            </div>
            <ul className="space-y-1.5">
              {c.digestItems.map((it, i) => (
                <motion.li
                  key={it}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 + i * 0.15, duration: 0.3 }}
                  className="flex items-center gap-2 text-[11px] [color:var(--mk-text-muted)]"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${it.includes("!") || it.includes("today") || it.includes("heute") || it.includes("überfällig") || it.includes("overdue") ? "bg-rose-400" : "bg-amber-400"}`} />
                  {it}
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.05, duration: 0.4 }}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Check size={13} className="text-emerald-400 shrink-0" />
              <span className="text-[11px] [color:var(--mk-text-muted)]">{c.invoiceLabel}</span>
            </div>
            <span className="text-xs font-bold text-emerald-300 font-mono">{c.invoiceValue}</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.35, duration: 0.4 }}
            className="flex items-center justify-between gap-2"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] [color:var(--mk-text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)]" /> {c.datevLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-300">
              <FileSignature size={9} /> {c.aiBadge}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function BrandedVerticalPage({
  lang,
  content: t,
  signupIndustry,
}: {
  lang: Lang;
  content: BrandedVerticalContent;
  signupIndustry: string;
}) {
  const signupHref = p(lang, `/signup?industry=${signupIndustry}`);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang} style={styleForIndustry(signupIndustry)}>
        <MarketingBackground />
        <MarketingNav lang={lang} />

        {/* Hero */}
        <section className="relative z-10 pt-20 pb-16 px-6 max-w-7xl mx-auto">
          <IndustryHeroMotif industry={signupIndustry} className="absolute inset-0 z-0 opacity-[0.16] hidden md:block" />
          <div className="relative z-10 grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border brand-border brand-soft text-xs brand-text font-medium mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-secondary)] animate-pulse" />
                {t.badge}
              </div>
              <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.08] tracking-tight mb-6">
                {t.h1a}
                <br />
                <span className="gradient-text glow-text">{t.h1b}</span>
              </h1>
              <p className="text-lg md:text-xl [color:var(--mk-text-muted)] max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed">
                {t.sub}
              </p>
              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                <Link href={signupHref}>
                  <Button size="xl" variant="glow">
                    {signupIndustry === "legal" ? <SubsumioMark size={18} tile={false} /> : signupIndustry === "tax" ? <TaxumioMark size={18} tile={false} /> : <SigmaMark size={18} tile={false} />} {t.ctaPrimary}
                  </Button>
                </Link>
                <Link href={p(lang, "/compare")}>
                  <Button size="xl" variant="secondary">{t.ctaSecondary}</Button>
                </Link>
              </div>
            </motion.div>

            <Cockpit c={t.cockpit} />
          </div>
        </section>

        <SignatureBand industry={signupIndustry} lang={lang} />

        <ProductWorkflowShowcase lang={lang} industry={signupIndustry} />

        {/* Product reel — Sigmabrain in action for this vertical */}
        <section className="relative z-10 py-28 px-6 max-w-5xl mx-auto">
          <Reveal variant="up">
            <SectionHeading
              title={lang === "de" ? "Sigmabrain in Aktion" : "Sigmabrain in action"}
              sub={lang === "de"
                ? "Datei anhängen, fragen, belegte Antwort erhalten — mit Fundstellen aus deinem eigenen Wissen."
                : "Attach a file, ask, get a cited answer — backed by your own knowledge."}
            />
          </Reveal>
          <DashboardReel lang={lang} industry={signupIndustry} className="mt-8" />
        </section>

        {/* Brain demo */}
        <section className="relative z-10 py-28 px-6 max-w-3xl mx-auto">
          <Reveal variant="up">
            <LiveDemo lang={lang} {...t.demo} />
          </Reveal>
        </section>

        {/* A day in the workflow — timeline */}
        <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-4xl mx-auto">
            <SectionHeading title={t.dayTitle} sub={t.daySub} />
            <div className="relative">
              <div className="absolute left-[19px] md:left-1/2 top-2 bottom-2 w-px [background:var(--mk-border)] md:-translate-x-1/2" />
              <div className="space-y-6">
                {t.steps.map((s, i) => {
                  const Icon = ICONS[s.icon];
                  const left = i % 2 === 0;
                  return (
                    <motion.div
                      key={s.title}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={viewport}
                      transition={{ duration: 0.4, delay: 0.05 }}
                      className={`relative flex gap-4 md:w-1/2 ${left ? "md:pr-10" : "md:ml-auto md:pl-10 md:flex-row-reverse md:text-right"}`}
                    >
                      <div className="relative z-10 shrink-0">
                        <div className="w-10 h-10 rounded-xl brand-soft border brand-border flex items-center justify-center">
                          {Icon && <Icon size={18} className="brand-text" />}
                        </div>
                      </div>
                      <div className="flex-1 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] p-4 hover:brand-border transition-colors">
                        <span className="text-xs font-mono brand-text">{s.time}</span>
                        <h3 className="text-sm font-semibold [color:var(--mk-text)] mt-1 mb-1.5">{s.title}</h3>
                        <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{s.desc}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Tools that ship today */}
        <section className="relative z-10 py-28 px-6 max-w-6xl mx-auto">
          <Reveal variant="up">
            <SectionHeading title={t.toolsTitle} sub={t.toolsSub} />
          </Reveal>
          <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8" stagger={0.07}>
            {t.tools.map((tool) => {
              const Icon = ICONS[tool.icon];
              return (
                <StaggerItem key={tool.title} className="h-full">
                  <Link
                    href={tool.href}
                    className="group block h-full p-6 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:brand-border-strong hover:bg-[#0f0f20] hover:-translate-y-1 transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl brand-soft border brand-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      {Icon && <Icon size={20} className="brand-text" />}
                    </div>
                    <h3 className="text-base font-bold [color:var(--mk-text)] mb-1.5">{tool.title}</h3>
                    <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{tool.desc}</p>
                    <span className="inline-flex items-center gap-1 text-xs brand-text mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {lang === "en" ? "Open" : "Öffnen"} <ArrowRight size={12} />
                    </span>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </section>

        {/* Trust band */}
        <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-6xl mx-auto">
            <Reveal variant="up">
              <SectionHeading title={t.trustTitle} />
            </Reveal>
            <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8" stagger={0.06}>
              {t.trust.map((tr) => {
                const Icon = ICONS[tr.icon];
                return (
                  <StaggerItem key={tr.title} className="p-5 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)]">
                    <div className="w-10 h-10 rounded-lg brand-soft border brand-border flex items-center justify-center mb-4">
                      {Icon && <Icon size={18} className="brand-text" />}
                    </div>
                    <h3 className="text-sm font-semibold [color:var(--mk-text)] mb-1.5">{tr.title}</h3>
                    <p className="text-xs [color:var(--mk-text-muted)] leading-relaxed">{tr.desc}</p>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
            <p className="text-xs [color:var(--mk-text-subtle)] leading-relaxed max-w-3xl mx-auto text-center mt-8">{t.honesty}</p>
          </div>
        </section>

        {/* Pricing — this branch's own tiers (or global fallback) */}
        <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)]">
          <BranchPricing lang={lang} industry={signupIndustry} />
        </section>

        {/* FAQ */}
        <section className="relative z-10 py-28 px-6">
          <div className="max-w-5xl mx-auto">
            <Reveal variant="up">
              <SectionHeading title={t.faqTitle} />
            </Reveal>
            <FaqList items={t.faq} />
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 py-28 px-6 text-center max-w-3xl mx-auto border-t [border-color:var(--mk-border)]">
          <Reveal variant="upLg">
            {signupIndustry === "legal" ? <SubsumioMark size={56} className="mx-auto mb-7" /> : signupIndustry === "tax" ? <TaxumioMark size={56} className="mx-auto mb-7" /> : <SigmaMark size={64} className="mx-auto mb-8 rounded-[15px] glow-purple" />}
            <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
            <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
            <Link href={signupHref}>
              <Button size="xl" variant="glow">
                {t.ctaButton} <ArrowRight size={18} />
              </Button>
            </Link>
          </Reveal>
        </section>

        <MarketingFooter lang={lang} />
      </div>
    </MotionConfig>
  );
}
