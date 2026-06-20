"use client";

// Download / install page — agency-grade: animated phone-mockup hero,
// platform cards with step-by-step install, live install prompt
// (Android/Desktop via beforeinstallprompt), store preview. Decorative motion
// respects prefers-reduced-motion via <MotionConfig reducedMotion="user">.

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import {
  ArrowRight,
  Apple,
  Smartphone,
  Monitor,
  Download as DownloadIcon,
  Bell,
  Fingerprint,
  Share2,
  WifiOff,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { p, type Lang } from "@/content/site";
import { DOWNLOAD } from "@/content/download";
import {
  MarketingBackground,
  MarketingNav,
  MarketingFooter,
  SectionHeading,
  FaqList,
} from "./chrome";
import { ScrollProgress } from "./motion-system";
import BackToTop from "./back-to-top";

const PLATFORM_ICONS: Record<string, LucideIcon> = { Apple, Smartphone, Monitor };

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const viewport = { once: true, margin: "-60px" } as const;

// --- Animated phone mockup -----------------------------------------------

function PhoneMockup({ lang }: { lang: Lang }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
      className="relative mx-auto w-[260px]"
    >
      {/* glow */}
      <div className="absolute -inset-6 bg-[var(--brand-primary)]/20 blur-3xl rounded-full" />

      {/* gentle float */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[2.6rem] border border-[#2a2a52] [background:var(--mk-bg)] p-2.5 shadow-2xl shadow-black/60"
      >
        {/* notch */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2.5 h-5 w-24 rounded-b-2xl [background:var(--mk-bg)] z-20" />

        <div className="relative rounded-[2.1rem] overflow-hidden bg-gradient-to-b from-[var(--mk-surface)] to-[var(--mk-bg)] aspect-[9/19]">
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-3 text-[9px] [color:var(--mk-text-muted)] font-mono">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[var(--brand-primary)]" /> Σ
            </span>
          </div>

          {/* app header */}
          <div className="flex items-center gap-2 px-5 pt-4 pb-3">
            <SubsumioMark size={22} />
            <span className="text-sm font-bold [color:var(--mk-text)]">Subsumio</span>
          </div>

          {/* search pill */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="mx-4 flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] px-3 py-2"
          >
            <Search size={12} className="text-[var(--brand-primary)]" />
            <span className="text-[10px] [color:var(--mk-text-muted)]">
              {lang === "en" ? "Ask your brain…" : "Frag dein Brain…"}
            </span>
          </motion.div>

          {/* answer card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.45 }}
            className="mx-4 mt-3 rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.05] p-3"
          >
            <p className="text-[10px] [color:var(--mk-text-muted)] leading-relaxed mb-2">
              {lang === "en"
                ? "3 open commitments across 4 meetings this week —"
                : "3 offene Zusagen in 4 Meetings diese Woche —"}
            </p>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 + i * 0.18, duration: 0.3 }}
                className="flex items-center gap-1.5 mb-1"
              >
                <span className="w-1 h-1 rounded-full bg-[var(--brand-primary)] shrink-0" />
                <span className="h-1.5 rounded-full bg-[#2a2a52]" style={{ width: `${70 - i * 12}%` }} />
              </motion.div>
            ))}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.9, duration: 0.4 }}
              className="text-[9px] [color:var(--signal-amber)] opacity-80 mt-2"
            >
              {lang === "en" ? "⚠ Gap: Thu 2pm has no notes" : "⚠ Lücke: Do 14 Uhr ohne Notiz"}
            </motion.p>
          </motion.div>

          {/* offline chip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.4 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] [background:var(--mk-surface)] px-3 py-1.5"
          >
            <WifiOff size={10} className="text-[var(--brand-secondary)]" />
            <span className="text-[9px] [color:var(--mk-text-muted)]">
              {lang === "en" ? "Works offline" : "Funktioniert offline"}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function DownloadPage({ lang }: { lang: Lang }) {
  const t = DOWNLOAD[lang];
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  // Chrome/Edge fire beforeinstallprompt → we can offer a real one-click install.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div data-tone="light" className="min-h-screen [background:var(--mk-bg)] overflow-x-hidden" lang={lang}>
        <ScrollProgress />
        <MarketingBackground />
        <MarketingNav lang={lang} />

        {/* Hero — copy left, phone mockup right */}
        <section className="relative z-10 pt-20 pb-16 px-6 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 text-xs text-[var(--brand-primary)] font-medium mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-pulse" />
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
                {installEvent ? (
                  <Button
                    size="xl"
                    variant="glow"
                    className="min-w-[240px]"
                    onClick={() => installEvent.prompt()}
                  >
                    <DownloadIcon size={18} />
                    {lang === "en" ? "Install Subsumio now" : "Subsumio jetzt installieren"}
                  </Button>
                ) : (
                  <Link href={p(lang, "/signup")}>
                    <Button size="xl" variant="glow">
                      {lang === "en" ? "Get started" : "Jetzt starten"} <ArrowRight size={18} />
                    </Button>
                  </Link>
                )}
                <Link href={p(lang, "/features")}>
                  <Button size="xl" variant="secondary">
                    {lang === "en" ? "See features" : "Features ansehen"}
                  </Button>
                </Link>
              </div>
            </motion.div>

            <PhoneMockup lang={lang} />
          </div>
        </section>

        {/* Platform cards */}
        <section className="relative z-10 px-6 max-w-6xl mx-auto pb-20">
          <div className="grid md:grid-cols-3 gap-5">
            {t.platforms.map((platform, idx) => {
              const Icon = PLATFORM_ICONS[platform.icon] ?? Monitor;
              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewport}
                  transition={{ delay: idx * 0.08, duration: 0.3 }}
                  className="p-7 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] hover:border-[var(--brand-primary)]/40 hover:[background:var(--mk-hover)] hover:-translate-y-1 transition-all flex flex-col"
                >
                  <div className="w-12 h-12 rounded-xl bg-[var(--brand-primary)]/10 border border-[var(--brand-primary)]/20 flex items-center justify-center mb-5">
                    <Icon size={22} className="text-[var(--brand-primary)]" />
                  </div>
                  <h2 className="text-lg font-bold [color:var(--mk-text)] mb-1">{platform.name}</h2>
                  <p className="text-sm text-[var(--brand-primary)] font-medium mb-5">{platform.tagline}</p>
                  <ol className="space-y-3 flex-1">
                    {platform.steps.map((step, i) => (
                      <li key={step} className="flex gap-3 text-sm [color:var(--mk-text-muted)] leading-relaxed">
                        <span className="w-5 h-5 rounded-full bg-[var(--brand-primary)]/20 border border-[var(--brand-primary)]/30 text-[var(--brand-primary)] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  {platform.note && (
                    <p className="text-xs [color:var(--mk-text-subtle)] leading-relaxed mt-5 pt-4 border-t [border-color:var(--mk-border)]">
                      {platform.note}
                    </p>
                  )}
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Store preview */}
        <section className="relative z-10 py-20 px-6 [background:var(--mk-surface)] border-y [border-color:var(--mk-border)]">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-black [color:var(--mk-text)] mb-4">{t.storesTitle}</h2>
            <p className="text-base [color:var(--mk-text-muted)] leading-relaxed mb-8">{t.storesSub}</p>

            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
              {[
                { icon: Bell, label: lang === "en" ? "Push notifications" : "Push-Benachrichtigungen" },
                { icon: Fingerprint, label: lang === "en" ? "Biometric unlock" : "Biometrische Entsperrung" },
                { icon: Share2, label: lang === "en" ? "“Send to Subsumio”" : "„An Subsumio senden“" },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <span key={f.label} className="inline-flex items-center gap-2 px-4 py-2 rounded-full border [border-color:var(--mk-border)] [background:var(--mk-surface)] text-xs [color:var(--mk-text-muted)]">
                    <Icon size={13} className="text-[var(--brand-primary)]" /> {f.label}
                  </span>
                );
              })}
            </div>

            {/* Store badge placeholders — replace with official badges at store launch */}
            <div className="flex items-center justify-center gap-4 mb-6">
              {["App Store", "Google Play"].map((store) => (
                <div
                  key={store}
                  aria-disabled="true"
                  className="flex items-center gap-3 px-6 py-3 rounded-xl border border-dashed [border-color:var(--mk-border-strong)] [background:var(--mk-bg)] opacity-70 select-none"
                >
                  <DownloadIcon size={16} className="[color:var(--mk-text-subtle)]" />
                  <div className="text-left">
                    <p className="text-[10px] [color:var(--mk-text-subtle)] uppercase tracking-wide">
                      {lang === "en" ? "Coming soon to" : "Bald im"}
                    </p>
                    <p className="text-sm font-semibold [color:var(--mk-text-muted)]">{store}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs [color:var(--mk-text-subtle)] max-w-xl mx-auto leading-relaxed">{t.storesNote}</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative z-10 py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <SectionHeading title={t.faqTitle} />
            <FaqList items={t.faq} />
          </div>
        </section>

        {/* CTA */}
        <section className="relative z-10 py-24 px-6 text-center max-w-3xl mx-auto border-t [border-color:var(--mk-border)]">
          <SubsumioMark size={64} className="mx-auto mb-8" />
          <h2 className="text-3xl md:text-4xl font-black [color:var(--mk-text)] mb-4">{t.ctaTitle}</h2>
          <p className="text-lg [color:var(--mk-text-muted)] mb-10">{t.ctaSub}</p>
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
