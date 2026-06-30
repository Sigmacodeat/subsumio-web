"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { getDocs } from "@/content/docs";
import { type Lang } from "@/content/site";
import { p, UI_STRINGS } from "@/content/site";
import { ICONS } from "./chrome";
import DashboardReel from "./dashboard-reel";
import { GlowCard, ClipReveal, EASE } from "./motion-system";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: EASE.out },
};

function FeatureCard({
  icon,
  title,
  desc,
  index,
}: {
  icon: string;
  title: string;
  desc: string;
  index: number;
}) {
  const Icon = ICONS[icon];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport}
      transition={{ duration: 0.4, delay: (index % 3) * 0.06 }}
    >
      <GlowCard className="h-full rounded-2xl p-5 transition-all duration-200 [background:var(--mk-surface)] hover:-translate-y-1 hover:shadow-lg hover:[background:var(--mk-surface-2)]">
        <div className="flex items-start gap-3.5">
          {Icon && (
            <div className="brand-soft mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 hover:scale-110">
              <Icon size={17} className="brand-text" />
            </div>
          )}
          <div>
            <h4 className="mb-1.5 text-sm font-semibold [color:var(--mk-text)]">{title}</h4>
            <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">{desc}</p>
          </div>
        </div>
      </GlowCard>
    </motion.div>
  );
}

function DocsProof({ lang }: { lang: Lang }) {
  const items =
    lang !== "en"
      ? [
          {
            icon: "FolderOpen",
            title: "Akten",
            desc: "Akte, Quellen, Fristen und Beteiligte bleiben in einem prüfbaren Kontext.",
          },
          {
            icon: "MessageSquare",
            title: "Copilot",
            desc: "Fragen, Zeitbuchungen und Uploads landen dort, wo die Arbeit passiert.",
          },
          {
            icon: "Shield",
            title: "Kontrolle",
            desc: "Berechtigungen, Audit-Trail und On-Premise-Option sind Teil des Produktkerns.",
          },
        ]
      : [
          {
            icon: "FolderOpen",
            title: "Matters",
            desc: "Matter files, sources, deadlines and parties stay in one verifiable context.",
          },
          {
            icon: "MessageSquare",
            title: "Copilot",
            desc: "Questions, time entries and uploads land where the work actually happens.",
          },
          {
            icon: "Shield",
            title: "Control",
            desc: "Permissions, audit trail and self-hosting are part of the product core.",
          },
        ];

  return (
    <section className="relative z-10 px-6 pb-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div {...reveal}>
          <p className="brand-text mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
            {UI_STRINGS[lang].dashboardNotDatasheet}
          </p>
          <h2 className="mb-4 text-3xl leading-tight font-black text-balance [color:var(--mk-text)] md:text-4xl">
            {UI_STRINGS[lang].docsTitle}
          </h2>
          <p className="mb-7 max-w-xl text-base leading-relaxed [color:var(--mk-text-muted)]">
            {UI_STRINGS[lang].docsSub}
          </p>
          <div className="grid gap-3">
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <div
                  key={item.title}
                  className="flex gap-3 rounded-lg border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]"
                >
                  <div className="brand-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    {Icon && <Icon size={17} className="brand-text" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold [color:var(--mk-text)]">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
        <motion.div {...reveal}>
          <DashboardReel lang={lang} />
        </motion.div>
      </div>
    </section>
  );
}

export default function DocsPage({ lang }: { lang: Lang }) {
  const d = getDocs(lang);

  return (
    <div
      data-tone="dark"
      className="relative min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-16 text-center">
        <motion.div
          className="relative z-10"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <div
            className="mb-8 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              color: "var(--brand-text)",
              background: "color-mix(in srgb, var(--brand-text) 10%, transparent)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--brand-text)" }}
            />
            {d.hero.badge}
          </div>
          <ClipReveal delay={0.1} duration={0.7} direction="up">
            <h1 className="mb-5 text-[clamp(2.5rem,10vw,3.75rem)] leading-[1.07] font-black tracking-tight text-balance [color:var(--mk-text)] md:text-6xl">
              {d.hero.title}
              <span className="sr-only"> </span>
              <br />
              <span className="gradient-text">{d.hero.claim}</span>
            </h1>
          </ClipReveal>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
            {d.hero.sub}
          </p>
          <p className="mx-auto max-w-xl text-sm leading-relaxed [color:var(--mk-text-subtle)]">
            {d.intro}
          </p>
        </motion.div>
      </section>

      <DocsProof lang={lang} />

      {/* Categories */}
      <section className="relative z-10 px-6 pb-28">
        <div className="mx-auto max-w-7xl space-y-20">
          {d.categories.map((cat, _ci) => (
            <motion.div key={cat.id} {...reveal}>
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
                  {cat.title}
                </h2>
                <p className="text-sm [color:var(--mk-text-muted)]">{cat.sub}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {cat.features.map((f, i) => (
                  <FeatureCard
                    key={f.title}
                    icon={f.icon}
                    title={f.title}
                    desc={f.desc}
                    index={i}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="relative z-10 px-4 py-24 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div {...reveal} className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
              {d.arch.title}
            </h2>
            <p className="text-sm [color:var(--mk-text-muted)]">{d.arch.sub}</p>
          </motion.div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.arch.items.map((item, i) => (
              <FeatureCard
                key={item.title}
                icon={item.icon}
                title={item.title}
                desc={item.desc}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <motion.section
        {...reveal}
        className="relative z-10 mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 lg:px-8"
      >
        <SubsumioMark size={56} className="mx-auto mb-7" />
        <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
          {d.cta.title}
        </h2>
        <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{d.cta.sub}</p>
        <Link href={p(lang, "/login")}>
          <Button size="lg" variant="primary">
            {d.cta.button} <ArrowRight size={16} />
          </Button>
        </Link>
      </motion.section>
    </div>
  );
}
