"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { getDocs, type Lang } from "@/content/docs";
import { p } from "@/content/site";
import { ICONS } from "./chrome";

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

export default function DocsPage({ lang }: { lang: Lang }) {
  const d = getDocs(lang);

  return (
    <div
      data-tone="dark"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
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

    </div>
  );
}
