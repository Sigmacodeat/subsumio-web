"use client";

import { motion, MotionConfig } from "framer-motion";
import { ArrowRight, Check, X, Minus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { getDocs, type Lang } from "@/content/docs";
import { getCompetitors } from "@/content/competitors";
import { p } from "@/content/site";
import { ICONS } from "./chrome";
import { MarketingBackground, MarketingNav, MarketingFooter } from "./chrome";
import { ScrollProgress } from "./motion-system";
import BackToTop from "./back-to-top";

const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: "easeOut" as const },
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
      whileHover={{ y: -3 }}
      className="rounded-2xl p-5 transition-colors duration-200 [background:var(--mk-surface)] hover:[background:var(--mk-surface-2)]"
      style={{ boxShadow: "var(--mk-card-shadow)" }}
    >
      <div className="flex items-start gap-3.5">
        {Icon && (
          <div className="brand-soft mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Icon size={17} className="brand-text" />
          </div>
        )}
        <div>
          <h4 className="mb-1.5 text-sm font-semibold [color:var(--mk-text)]">{title}</h4>
          <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">{desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  status: boolean | "partial";
  labels: { yes: string; no: string; partial: string };
}) {
  if (status === true)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-secondary)]">
        <Check size={13} /> {labels.yes}
      </span>
    );
  if (status === false)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
        <X size={13} /> {labels.no}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
      <Minus size={13} /> {labels.partial}
    </span>
  );
}

function ComparisonSection({ lang }: { lang: Lang }) {
  const c = getCompetitors(lang);
  return (
    <section className="relative z-10 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <motion.div {...reveal} className="mb-10 text-center">
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ color: "#60a5fa", background: "rgba(96,165,250,0.10)" }}
          >
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: "#60a5fa" }}
            />
            {c.badge}
          </div>
          <h2 className="mb-3 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {c.title}
            <br />
            <span className="gradient-text">{c.claim}</span>
          </h2>
          <p className="mx-auto max-w-2xl text-sm [color:var(--mk-text-muted)]">{c.sub}</p>
        </motion.div>

        <motion.div {...reveal} className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b [border-color:var(--mk-border)]">
                <th className="py-3 pr-4 text-xs font-semibold tracking-wider whitespace-nowrap [color:var(--mk-text-muted)] uppercase">
                  {c.tableTitle}
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider whitespace-nowrap text-[var(--brand-primary)] uppercase">
                  {c.subsumioLabel}
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider whitespace-nowrap [color:var(--mk-text-subtle)] uppercase">
                  {c.harveyLabel}
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider whitespace-nowrap [color:var(--mk-text-subtle)] uppercase">
                  {c.legoraLabel}
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider whitespace-nowrap [color:var(--mk-text-subtle)] uppercase">
                  {c.josefLabel}
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider whitespace-nowrap [color:var(--mk-text-subtle)] uppercase">
                  {c.cocounselLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={`border-b [border-color:var(--mk-border)] ${i % 2 === 0 ? "[background:var(--mk-surface)]" : ""}`}
                >
                  <td className="py-2.5 pr-4 text-sm [color:var(--mk-text)]">{row.feature}</td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={row.subsumio} labels={c} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={row.harvey} labels={c} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={row.legora} labels={c} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={row.josef} labels={c} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <StatusBadge status={row.cocounsel} labels={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <motion.div
          {...reveal}
          className="mt-10 rounded-2xl p-6 [background:var(--mk-surface)]"
          style={{ boxShadow: "var(--mk-card-shadow)" }}
        >
          <h3 className="mb-3 text-lg font-black [color:var(--mk-text)]">{c.verdictTitle}</h3>
          <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{c.verdict}</p>
        </motion.div>

        <p className="mt-4 text-[11px] leading-relaxed [color:var(--mk-text-subtle)]">
          {c.footnote}
        </p>
      </div>
    </section>
  );
}

export default function DocsPage({ lang }: { lang: Lang }) {
  const d = getDocs(lang);

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-tone="dark"
        className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
        lang={lang}
      >
        <ScrollProgress />
        <MarketingBackground />
        <MarketingNav lang={lang} />

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
              style={{ color: "#60a5fa", background: "rgba(96,165,250,0.10)" }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "#60a5fa" }}
              />
              {d.hero.badge}
            </div>
            <h1 className="mb-5 text-5xl leading-[1.05] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
              {d.hero.title}
              <br />
              <span className="gradient-text">{d.hero.claim}</span>
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
              {d.hero.sub}
            </p>
            <p className="mx-auto max-w-xl text-sm leading-relaxed [color:var(--mk-text-subtle)]">
              {d.intro}
            </p>
          </motion.div>
        </section>

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

        {/* Competitive Comparison */}
        <ComparisonSection lang={lang} />

        {/* Architecture */}
        <section className="relative z-10 px-6 py-24 [background:var(--mk-surface)]">
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
          className="relative z-10 mx-auto max-w-3xl px-6 py-28 text-center"
        >
          <SubsumioMark size={56} className="mx-auto mb-7" />
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {d.cta.title}
          </h2>
          <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{d.cta.sub}</p>
          <Link href={p(lang, "/login")}>
            <Button size="lg" variant="glow">
              <SubsumioMark size={16} tile={false} /> {d.cta.button} <ArrowRight size={16} />
            </Button>
          </Link>
        </motion.section>

        <MarketingFooter lang={lang} />
        <BackToTop lang={lang} />
      </div>
    </MotionConfig>
  );
}
