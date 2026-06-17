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
import {
  motion,
  AnimatePresence,
  MotionConfig,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SigmaMark } from "@/components/brand/logo";
import { p, type Lang } from "@/content/site";
import { FEATURES_PAGE } from "@/content/features";
import SubsumioShowcase from "./subsumio-showcase";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  ICONS,
} from "./chrome";

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
  [0, 1], [0, 2], [0, 4], [1, 4], [4, 3], [2, 5], [4, 6], [1, 3], [4, 5],
];

function GraphHero() {
  return (
    <div className="relative w-full max-w-[460px] mx-auto aspect-[460/360]">
      <svg viewBox="0 0 460 360" className="w-full h-full" aria-hidden>
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
              animate={
                n.pulse
                  ? { scale: [1, 1.18, 1], opacity: 1 }
                  : { scale: 1, opacity: 1 }
              }
              transition={
                n.pulse
                  ? {
                      scale: { duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.9 + i * 0.05 },
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
      { icon: "Database", title: "Füttern", desc: "Akten, Mails, PDFs, Sprachnotizen, WhatsApp — per Ordner, Upload oder Copilot. OCR holt Text auch aus Scans.", tag: "Upload · OCR · Copilot" },
      { icon: "Network", title: "Verstehen", desc: "Bei jedem Write extrahiert die Engine typisierte Kanten — Personen, Fristen, Beziehungen — als juristischer Wissensgraph.", tag: "Entitäten · Graph · Embeddings" },
      { icon: "Search", title: "Fragen", desc: "Frag in normaler Sprache. Hybrid-Suche aus Vektor, Stichwort und Graph findet die entscheidenden Stellen.", tag: "Hybrid-Suche · Reranking" },
      { icon: "Brain", title: "Belegte Antwort", desc: "Synthetisierte Antwort mit seitengenauen Zitaten — plus ehrlicher Hinweis, was in der Akte noch fehlt.", tag: "Zitate · Lückenanalyse" },
    ],
  },
  en: {
    title: "How it works — from document to a cited answer",
    sub: "Four steps. No tagging, no data entry — the brain wires itself.",
    steps: [
      { icon: "Database", title: "Feed it", desc: "Matters, emails, PDFs, voice notes, WhatsApp — by folder, upload or copilot. OCR pulls text from scans too.", tag: "Upload · OCR · copilot" },
      { icon: "Network", title: "It understands", desc: "On every write the engine extracts typed edges — people, deadlines, relationships — as a legal knowledge graph.", tag: "Entities · graph · embeddings" },
      { icon: "Search", title: "Ask", desc: "Ask in plain language. Hybrid retrieval across vector, keyword and graph finds the decisive passages.", tag: "Hybrid search · reranking" },
      { icon: "Brain", title: "Cited answer", desc: "A synthesized answer with page-level citations — plus an honest note on what the file is still missing.", tag: "Citations · gap analysis" },
    ],
  },
} as const;

function HowItWorks({ lang }: { lang: Lang }) {
  const h = HOW[lang];
  return (
    <section className="relative z-10 px-6 max-w-6xl mx-auto pb-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewport}
        transition={{ duration: 0.4 }}
        className="text-center mb-14"
      >
        <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)] mb-3">{h.title}</h2>
        <p className="text-base [color:var(--mk-text-muted)] max-w-2xl mx-auto">{h.sub}</p>
      </motion.div>

      <div className="relative grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* animated connector line (lg+) */}
        <motion.div
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: "easeInOut", delay: 0.2 }}
          className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-px origin-left"
          style={{ background: "linear-gradient(90deg, transparent, var(--brand-primary), transparent)" }}
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
              <div className="relative z-10 mx-auto mb-5 w-14 h-14 rounded-2xl brand-soft border brand-border flex items-center justify-center shadow-lg shadow-black/40">
                {Icon && <Icon size={22} className="brand-text" />}
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full brand-bg text-white text-xs font-bold flex items-center justify-center shadow-md">{i + 1}</span>
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold [color:var(--mk-text)] mb-2">{s.title}</h3>
                <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed mb-3">{s.desc}</p>
                <span className="inline-block text-[10px] font-mono brand-text brand-soft px-2 py-1 rounded-full">{s.tag}</span>
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
  const isSubsumio = true;
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
      <div className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
        <MarketingBackground />
        <MarketingNav lang={lang} />

        {/* Hero — copy left, animated graph right */}
        <section className="relative z-10 pt-20 pb-16 px-6 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border brand-border brand-soft text-xs brand-text font-medium mb-8">
                <span className="w-1.5 h-1.5 rounded-full brand-bg animate-pulse" />
                {t.badge}
              </div>
              <h1 className="text-4xl md:text-6xl font-black [color:var(--mk-text)] leading-[1.08] tracking-tight mb-6">
                {t.h1a}
                <br />
                <span className="gradient-text glow-text">{t.h1b}</span>
              </h1>
              <p className="text-lg md:text-xl [color:var(--mk-text-muted)] max-w-xl mx-auto lg:mx-0 leading-relaxed mb-8">
                {t.sub}
              </p>
              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                <Link href={p(lang, "/signup")}>
                  <Button size="lg" variant="glow">
                    {t.ctaButton} <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link href={p(lang, "/compare")}>
                  <Button size="lg" variant="secondary">
                    {lang === "en" ? "Compare honestly" : "Ehrlich vergleichen"}
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
              <div className="absolute inset-0 brand-soft blur-3xl rounded-full" />
              <div className="relative glass rounded-3xl p-6 shadow-2xl shadow-black/40">
                <GraphHero />
                <p className="text-center text-xs [color:var(--mk-text-subtle)] font-mono mt-2">
                  {lang === "en"
                    ? "typed edges, extracted on every write"
                    : "typisierte Kanten, bei jedem Write extrahiert"}
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats band */}
        <section className="relative z-10 px-6 pb-20 max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewport}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] p-5 text-center hover:[border-color:var(--mk-border-strong)] transition-colors"
              >
                <div className="text-3xl md:text-4xl font-black gradient-text mb-1">
                  {s.prefix ?? ""}
                  <CountUp to={s.to} decimals={s.dec} />
                  {s.suffix ?? ""}
                </div>
                <p className="text-xs [color:var(--mk-text-muted)] leading-snug">{s.label}</p>
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
        <section className="relative z-10 px-6 max-w-6xl mx-auto pb-24">
          <div
            role="tablist"
            aria-label="Feature categories"
            className="flex flex-wrap justify-center gap-2 mb-12"
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
                  className={`relative flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${
                    isActive ? "brand-text" : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="feature-tab-pill"
                      className="absolute inset-0 rounded-full brand-soft border brand-border shadow-lg shadow-black/30"
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
              className="grid lg:grid-cols-2 gap-8 items-start"
            >
              {/* Left: explanation */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl brand-soft border brand-border flex items-center justify-center">
                    {CatIcon && <CatIcon size={22} className="brand-text" />}
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)]">{cat.title}</h2>
                </div>
                <p className="text-base [color:var(--mk-text-muted)] leading-relaxed mb-8">{cat.intro}</p>
                <div className="space-y-4">
                  {cat.items.map((item, i) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 * i, duration: 0.22 }}
                      className="flex gap-3 p-4 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:brand-border hover:bg-[#0f0f20] transition-colors"
                    >
                      <CheckCircle2 size={16} className="brand-text shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold [color:var(--mk-text)] mb-1">{item.title}</h3>
                        <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right: terminal demo */}
              {cat.demo ? (
                <div className="lg:sticky lg:top-8">
                  <div className="rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] shadow-2xl shadow-black/50 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b [border-color:var(--mk-border)]">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                      <div className="flex-1 ml-4 text-xs [color:var(--mk-text-subtle)] font-mono">{cat.demo.windowTitle}</div>
                    </div>
                    <div className="p-5 font-mono text-xs leading-relaxed space-y-1.5">
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
                                ? "text-amber-400"
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
                <div className="hidden lg:flex items-center justify-center h-full min-h-[300px] rounded-2xl border border-dashed [border-color:var(--mk-border)]">
                  <div className="text-center px-8">
                    {CatIcon && <CatIcon size={32} className="brand-text mx-auto mb-4" />}
                    <p className="text-sm [color:var(--mk-text-subtle)] max-w-xs">
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

        {/* Everything at a glance */}
        <section className="relative z-10 px-6 max-w-6xl mx-auto pb-24">
          <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)] text-center mb-12">
            {lang === "en" ? "Six capability areas, one engine" : "Sechs Fähigkeits-Bereiche, eine Engine"}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  className="group text-left p-6 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:brand-border hover:bg-[#0f0f20] hover:-translate-y-1 transition-all"
                >
                  <div className="w-11 h-11 rounded-xl brand-soft border brand-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {Icon && <Icon size={20} className="brand-text" />}
                  </div>
                  <h3 className="text-base font-bold [color:var(--mk-text)] mb-1.5">{c.title}</h3>
                  <p className="text-sm [color:var(--mk-text-muted)] leading-relaxed line-clamp-3">{c.intro}</p>
                  <span className="inline-flex items-center gap-1 text-xs brand-text mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    {lang === "en" ? "Explore" : "Ansehen"} <ArrowRight size={12} />
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 py-24 px-6 text-center max-w-3xl mx-auto border-t [border-color:var(--mk-border)]">
          <SigmaMark size={64} className="mx-auto mb-8 rounded-[15px] glow" />
          <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
          <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
          <Link href={p(lang, "/signup")}>
            <Button size="xl" variant="glow">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </section>

        <MarketingFooter lang={lang} />
      </div>
    </MotionConfig>
  );
}
