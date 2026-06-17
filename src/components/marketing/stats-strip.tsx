"use client";

// Animated stats strip — dark band with counting numbers that fire once
// when the section enters the viewport. Pure rAF counter, no extra deps.
// Used between light sections to maintain the dark/light rhythm.

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import type { Lang } from "@/content/site";

interface Stat {
  prefix?: string;
  value: number;
  decimals?: number;
  suffix: string;
  label: string;
  sub?: string;
}

const STATS: Record<Lang, Stat[]> = {
  en: [
    { value: 97.9, decimals: 1, suffix: "%", label: "Recall@5", sub: "Hybrid search benchmark" },
    { value: 24,   suffix: "",  label: "Bundled statutes", sub: "AT · DE · CH" },
    { value: 3,    suffix: "",  label: "Jurisdictions", sub: "Austria · Germany · Switzerland" },
    { value: 10,   suffix: " yr", label: "GoBD retention", sub: "Audit-proof by design" },
  ],
  de: [
    { value: 97.9, decimals: 1, suffix: "%", label: "Recall@5", sub: "Hybrid-Search-Benchmark" },
    { value: 24,   suffix: "",  label: "Gesetze im Korpus", sub: "AT · DE · CH" },
    { value: 3,    suffix: "",  label: "Jurisdiktionen", sub: "Österreich · Deutschland · Schweiz" },
    { value: 10,   suffix: " J.", label: "GoBD-Aufbewahrung", sub: "Revisionssicher by design" },
  ],
};

function AnimatedNumber({ stat, trigger }: { stat: Stat; trigger: boolean }) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!trigger) return;
    let start: number | null = null;
    const duration = 1600;
    const target = stat.value;

    function frame(ts: number) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setCurrent(target * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(frame);
      else setCurrent(target);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [trigger, stat.value]);

  const formatted = current.toFixed(stat.decimals ?? 0);

  return (
    <span>
      {stat.prefix ?? ""}
      {formatted}
      {stat.suffix}
    </span>
  );
}

export default function StatsStrip({ lang }: { lang: Lang }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const stats = STATS[lang] ?? STATS.en;

  return (
    <section
      ref={ref}
      className="relative z-10 py-16 px-6 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, var(--mk-bg) 0%, var(--mk-surface) 50%, var(--mk-bg) 100%)",
        borderTop: "1px solid var(--mk-border)",
        borderBottom: "1px solid var(--mk-border)",
      }}
    >
      {/* subtle glow */}
      <div
        className="absolute inset-x-1/4 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--brand-primary), transparent)" }}
      />

      <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.45, delay: i * 0.1 }}
            className="text-center"
          >
            <p className="text-3xl md:text-4xl font-black [color:var(--mk-text)] tracking-tight tabular-nums mb-1 gradient-text">
              <AnimatedNumber stat={stat} trigger={inView} />
            </p>
            <p className="text-sm font-semibold [color:var(--mk-text)] mb-0.5">{stat.label}</p>
            {stat.sub && (
              <p className="text-xs text-[#6a6a85]">{stat.sub}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* bottom line */}
      <div
        className="absolute inset-x-1/4 bottom-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--brand-secondary), transparent)" }}
      />
    </section>
  );
}
