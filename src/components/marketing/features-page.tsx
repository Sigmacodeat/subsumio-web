"use client";

// Features page — agency-grade capability tour.
//
// Sections: animated knowledge-graph hero · count-up stats band ·
// interactive category explorer (sliding indicator, animated terminal demos) ·
// "everything at a glance" grid · CTA. All decorative motion respects
// prefers-reduced-motion via <MotionConfig reducedMotion="user">; the count-up
// and infinite graph pulse fall back to static under reduced motion.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, MotionConfig, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { p, type Lang } from "@/content/site";
import { FEATURES_PAGE } from "@/content/features";
import SubsumioShowcase from "./subsumio-showcase";
import { MarketingBackground, MarketingNav, MarketingFooter, ICONS, useSiteBrand } from "./chrome";
import { ScrollProgress } from "./motion-system";
import BackToTop from "./back-to-top";

const viewport = { once: true, margin: "-60px" } as const;

// --- Animated knowledge-graph hero visual --------------------------------

type GNode = { x: number; y: number; label?: string; r: number; pulse?: boolean };

const NODES: GNode[] = [
  { x: 240, y: 56, label: "Akte", r: 7, pulse: true },
  { x: 110, y: 134, label: "Mandant", r: 6 },
  { x: 372, y: 130, label: "Gegner", r: 6 },
  { x: 70, y: 250, label: "Frist", r: 5 },
  { x: 240, y: 210, label: "Schriftsatz", r: 7, pulse: true },
  { x: 408, y: 248, label: "Urteil", r: 6 },
  { x: 196, y: 320, label: "Honorar", r: 5 },
];

const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 4],
  [4, 3],
  [2, 5],
  [4, 6],
  [1, 3],
  [4, 5],
];

function GraphHero() {
  return (
    <div className="relative mx-auto aspect-[460/360] w-full max-w-[460px]">
      <svg viewBox="0 0 460 360" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--brand-secondary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0.7" />
          </radialGradient>
          <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--mk-border-strong)" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* edges draw in */}
        {EDGES.map(([a, b], i) => (
          <motion.line
            key={`e${i}`}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="url(#edgeGrad)"
            strokeWidth={1.4}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: "easeOut" }}
          />
        ))}

        {/* nodes pop in, key ones keep a gentle pulse */}
        {NODES.map((n, i) => (
          <g key={`n${i}`}>
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="url(#nodeGlow)"
              stroke="var(--brand-secondary)"
              strokeWidth={1}
              initial={{ scale: 0, opacity: 0 }}
              animate={n.pulse ? { scale: [1, 1.18, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
              transition={
                n.pulse
                  ? {
                      scale: {
                        duration: 2.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.9 + i * 0.05,
                      },
                      opacity: { duration: 0.4, delay: 0.6 + i * 0.07 },
                    }
                  : { duration: 0.4, delay: 0.6 + i * 0.07, type: "spring", stiffness: 200 }
              }
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
            {n.label && (
              <motion.text
                x={n.x}
                y={n.y - n.r - 7}
                textAnchor="middle"
                className="fill-[#a8a8be]"
                style={{ fontSize: 10, fontFamily: "var(--font-jetbrains), monospace" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.9 + i * 0.07 }}
              >
                {n.label}
              </motion.text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// --- Count-up stat -------------------------------------------------------

function CountUp({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(to);
      return;
    }
    const duration = 1100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, reduce]);

  return <span ref={ref}>{val.toFixed(decimals)}</span>;
}

// --- "How it works" pipeline (sequential reveal + animated connector) ----

const HOW = {
  de: {
    title: "So funktioniert's — vom Dokument zur belegten Antwort",
    sub: "Vier Schritte. Kein Tagging, keine Datenpflege — das Brain verdrahtet sich selbst.",
    steps: [
      {
        icon: "Database",
        title: "Füttern",
        desc: "Akten, Mails, PDFs, Sprachnotizen, WhatsApp — per Ordner, Upload oder Copilot. OCR holt Text auch aus Scans.",
        tag: "Upload · OCR · Copilot",
      },
      {
        icon: "Network",
        title: "Verstehen",
        desc: "Bei jedem Write extrahiert die Engine typisierte Kanten — Personen, Fristen, Beziehungen — als juristischer Wissensgraph.",
        tag: "Entitäten · Graph · Embeddings",
      },
      {
        icon: "Search",
        title: "Fragen",
        desc: "Frag in normaler Sprache. Hybrid-Suche aus Vektor, Stichwort und Graph findet die entscheidenden Stellen.",
        tag: "Hybrid-Suche · Reranking",
      },
      {
        icon: "Brain",
        title: "Belegte Antwort",
        desc: "Synthetisierte Antwort mit seitengenauen Zitaten — plus ehrlicher Hinweis, was in der Akte noch fehlt.",
        tag: "Zitate · Lückenanalyse",
      },
    ],
  },
  en: {
    title: "How it works — from document to a cited answer",
    sub: "Four steps. No tagging, no data entry — the brain wires itself.",
    steps: [
      {
        icon: "Database",
        title: "Feed it",
        desc: "Matters, emails, PDFs, voice notes, WhatsApp — by folder, upload or copilot. OCR pulls text from scans too.",
        tag: "Upload · OCR · copilot",
      },
      {
        icon: "Network",
        title: "It understands",
        desc: "On every write the engine extracts typed edges — people, deadlines, relationships — as a legal knowledge graph.",
        tag: "Entities · graph · embeddings",
      },
      {
        icon: "Search",
        title: "Ask",
        desc: "Ask in plain language. Hybrid retrieval across vector, keyword and graph finds the decisive passages.",
        tag: "Hybrid search · reranking",
      },
      {
        icon: "Brain",
        title: "Cited answer",
        desc: "A synthesized answer with page-level citations — plus an honest note on what the file is still missing.",
        tag: "Citations · gap analysis",
      },
    ],
  },
} as const;

function HowItWorks({ lang }: { lang: Lang }) {
  const h = HOW[lang];
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.4 }}
        className="mb-14 text-center"
      >
        <h2 className="mb-3 text-2xl font-black [color:var(--mk-text)] md:text-3xl">{h.title}</h2>
        <p className="mx-auto max-w-2xl text-base [color:var(--mk-text-muted)]">{h.sub}</p>
      </motion.div>

      <div className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {/* animated connector line (lg+) */}
        <motion.div
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: "easeInOut", delay: 0.2 }}
          className="absolute top-7 right-[12.5%] left-[12.5%] hidden h-px origin-left lg:block"
          style={{
            background: "linear-gradient(90deg, transparent, var(--brand-primary), transparent)",
          }}
        />
        {h.steps.map((s, i) => {
          const Icon = ICONS[s.icon];
          return (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewport}
              transition={{ duration: 0.45, delay: i * 0.18, ease: [0.21, 0.5, 0.27, 1] }}
              className="relative"
            >
              <div className="brand-soft brand-border relative z-10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border shadow-lg shadow-black/40">
                {Icon && <Icon size={22} className="brand-text" />}
                <span className="brand-bg absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow-md">
                  {i + 1}
                </span>
              </div>
              <div className="text-center">
                <h3 className="mb-2 text-base font-bold [color:var(--mk-text)]">{s.title}</h3>
                <p className="mb-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {s.desc}
                </p>
                <span className="brand-text brand-soft inline-block rounded-full px-2 py-1 font-mono text-[10px]">
                  {s.tag}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

export default function FeaturesPage({ lang }: { lang: Lang }) {
  const t = FEATURES_PAGE[lang];
  const brand = useSiteBrand();
  const isSubsumio = brand === "subsumio";
  const [active, setActive] = useState(t.categories[0].id);
  const cat = t.categories.find((c) => c.id === active) ?? t.categories[0];
  const CatIcon = ICONS[cat.icon];

  const stats =
    lang === "en"
      ? [
          { to: 97.9, dec: 1, suffix: "%", label: "Recall@5 on the benchmark corpus" },
          { to: 31.4, dec: 1, prefix: "+", label: "P@5 points over vector-only RAG" },
          { to: 9, dec: 0, label: "native data connectors" },
          { to: 66, dec: 0, label: "autonomous jobs in production" },
        ]
      : [
          { to: 97.9, dec: 1, suffix: " %", label: "Recall@5 auf dem Benchmark-Korpus" },
          { to: 31.4, dec: 1, prefix: "+", label: "P@5-Punkte über reines Vektor-RAG" },
          { to: 9, dec: 0, label: "native Daten-Konnektoren" },
          { to: 66, dec: 0, label: "autonome Jobs im Produktivbetrieb" },
        ];

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-tone="light"
        className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
        lang={lang}
      >
        <ScrollProgress />
        <MarketingBackground />
        <MarketingNav lang={lang} />

        {/* Hero — copy left, animated graph right */}
        <section className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-16">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <div className="brand-border brand-soft brand-text mb-8 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium">
                <span className="brand-bg h-1.5 w-1.5 animate-pulse rounded-full" />
                {t.badge}
              </div>
              <h1 className="mb-6 text-4xl leading-[1.08] font-black tracking-tight [color:var(--mk-text)] md:text-6xl">
                {t.h1a}
                <br />
                <span className="gradient-text glow-text">{t.h1b}</span>
              </h1>
              <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed [color:var(--mk-text-muted)] md:text-xl lg:mx-0">
                {t.sub}
              </p>
              <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link href={p(lang, "/signup")}>
                  <Button size="lg" variant="glow">
                    {t.ctaButton} <ArrowRight size={16} />
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
              className="relative"
            >
              <div className="brand-soft absolute inset-0 rounded-full blur-3xl" />
              <div className="glass relative rounded-3xl p-6 shadow-2xl shadow-black/40">
                <GraphHero />
                <p className="mt-2 text-center font-mono text-xs [color:var(--mk-text-subtle)]">
                  {lang === "en"
                    ? "typed edges, extracted on every write"
                    : "typisierte Kanten, bei jedem Write extrahiert"}
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats band */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewport}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-2xl border [border-color:var(--mk-border)] p-5 text-center transition-colors [background:var(--mk-surface)] hover:[border-color:var(--mk-border-strong)]"
              >
                <div className="gradient-text mb-1 text-3xl font-black md:text-4xl">
                  {s.prefix ?? ""}
                  <CountUp to={s.to} decimals={s.dec} />
                  {s.suffix ?? ""}
                </div>
                <p className="text-xs leading-snug [color:var(--mk-text-muted)]">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works — sequential pipeline */}
        <HowItWorks lang={lang} />

        {/* On the Subsumio brand: the comprehensive law-firm feature set
            (WhatsApp copilot spotlight + the full capability bento). */}
        {isSubsumio && <SubsumioShowcase lang={lang} />}

        {/* Category explorer */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
          <div
            role="tablist"
            aria-label="Feature categories"
            className="mb-12 flex flex-wrap justify-center gap-2"
          >
            {t.categories.map((c) => {
              const Icon = ICONS[c.icon];
              const isActive = c.id === active;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(c.id)}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "brand-text"
                      : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="feature-tab-pill"
                      className="brand-soft brand-border absolute inset-0 rounded-full border shadow-lg shadow-black/30"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    {Icon && <Icon size={14} />}
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={cat.id}
              role="tabpanel"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="grid items-start gap-8 lg:grid-cols-2"
            >
              {/* Left: explanation */}
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="brand-soft brand-border flex h-12 w-12 items-center justify-center rounded-xl border">
                    {CatIcon && <CatIcon size={22} className="brand-text" />}
                  </div>
                  <h2 className="text-2xl font-black [color:var(--mk-text)] md:text-3xl">
                    {cat.title}
                  </h2>
                </div>
                <p className="mb-8 text-base leading-relaxed [color:var(--mk-text-muted)]">
                  {cat.intro}
                </p>
                <div className="space-y-4">
                  {cat.items.map((item, i) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 * i, duration: 0.22 }}
                      className="hover:brand-border flex gap-3 rounded-xl border [border-color:var(--mk-border)] p-4 transition-colors [background:var(--mk-surface)] hover:[background:var(--mk-hover)]"
                    >
                      <CheckCircle2 size={16} className="brand-text mt-0.5 shrink-0" />
                      <div>
                        <h3 className="mb-1 text-sm font-semibold [color:var(--mk-text)]">
                          {item.title}
                        </h3>
                        <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                          {item.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right: terminal demo */}
              {cat.demo ? (
                <div className="lg:sticky lg:top-8">
                  <div className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/50 [background:var(--mk-bg)]">
                    <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                      <div className="ml-4 flex-1 font-mono text-xs [color:var(--mk-text-subtle)]">
                        {cat.demo.windowTitle}
                      </div>
                    </div>
                    <div className="space-y-1.5 p-5 font-mono text-xs leading-relaxed">
                      {cat.demo.lines.map((line, i) => (
                        <motion.p
                          key={`${cat.id}-${i}`}
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.12 * i, duration: 0.25 }}
                          className={
                            line.startsWith("$") || line.startsWith(">")
                              ? "[color:var(--mk-text)]"
                              : line.includes("⚠")
                                ? "[color:var(--signal-amber)]"
                                : line.startsWith("→") || line.match(/^\d\d:\d\d/)
                                  ? "brand-text"
                                  : "[color:var(--mk-text-muted)]"
                          }
                        >
                          {line}
                        </motion.p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hidden h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed [border-color:var(--mk-border)] lg:flex">
                  <div className="px-8 text-center">
                    {CatIcon && <CatIcon size={32} className="brand-text mx-auto mb-4" />}
                    <p className="max-w-xs text-sm [color:var(--mk-text-subtle)]">
                      {lang === "en"
                        ? "Enforced by tests, not policy docs — deterministic, verifiable behavior."
                        : "Durch Tests erzwungen, nicht durch Policy-Dokumente — deterministisches, prüfbares Verhalten."}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Security cross-link — replaces former Security & Teams category */}
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="brand-border relative overflow-hidden rounded-3xl border p-8 text-center [background:var(--mk-surface)] md:p-12"
          >
            <div className="brand-soft absolute inset-0 opacity-30 blur-3xl" />
            <div className="relative">
              <div className="brand-soft brand-border mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border">
                <Shield size={24} className="brand-text" />
              </div>
              <h2 className="mb-3 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
                {lang === "en"
                  ? "Built for confidentiality-first work"
                  : "Gebaut für Verschwiegenheit zuerst"}
              </h2>
              <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)]">
                {lang === "en"
                  ? "Self-hosting, fuzz-tested isolation, EU AI Act compliance, and an honest roadmap. The full security and data-protection story lives on its own page."
                  : "Self-Hosting, fuzz-getestete Isolation, EU-AI-Act-Compliance und eine ehrliche Roadmap. Die vollständige Security- und Datenschutz-Story hat eine eigene Seite."}
              </p>
              <Link href={p(lang, "/security")}>
                <Button size="lg" variant="secondary">
                  {lang === "en" ? "Explore security" : "Sicherheit ansehen"}{" "}
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Everything at a glance */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
          <h2 className="mb-12 text-center text-2xl font-black [color:var(--mk-text)] md:text-3xl">
            {lang === "en"
              ? "Five capability areas, one engine"
              : "Fünf Fähigkeits-Bereiche, eine Engine"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.categories.map((c, i) => {
              const Icon = ICONS[c.icon];
              return (
                <motion.button
                  key={c.id}
                  onClick={() => {
                    setActive(c.id);
                    if (typeof window !== "undefined")
                      window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewport}
                  transition={{ duration: 0.35, delay: (i % 3) * 0.08 }}
                  className="group hover:brand-border rounded-2xl border [border-color:var(--mk-border)] p-6 text-left transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:[background:var(--mk-hover)]"
                >
                  <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border transition-transform group-hover:scale-110">
                    {Icon && <Icon size={20} className="brand-text" />}
                  </div>
                  <h3 className="mb-1.5 text-base font-bold [color:var(--mk-text)]">{c.title}</h3>
                  <p className="line-clamp-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {c.intro}
                  </p>
                  <span className="brand-text mt-4 inline-flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                    {lang === "en" ? "Explore" : "Ansehen"} <ArrowRight size={12} />
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 mx-auto max-w-3xl border-t [border-color:var(--mk-border)] px-6 py-24 text-center">
          <SubsumioMark size={64} className="glow mx-auto mb-8 rounded-[15px]" />
          <h2 className="mb-4 text-3xl font-black [color:var(--mk-text)] md:text-4xl">
            {t.ctaTitle}
          </h2>
          <p className="mb-10 text-lg [color:var(--mk-text-muted)]">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </section>

        <MarketingFooter lang={lang} />
        <BackToTop lang={lang} />
      </div>
    </MotionConfig>
  );
}
