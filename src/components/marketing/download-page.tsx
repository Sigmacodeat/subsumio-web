"use client";

// Download / install page — agency-grade: animated phone-mockup hero,
// platform cards with step-by-step install, live install prompt
// (Android/Desktop via beforeinstallprompt), store preview. Decorative motion
// respects prefers-reduced-motion via <MotionConfig reducedMotion="user">.

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { DOWNLOAD } from "@/content/download";
import { SectionHeading } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { GlowCard, ClipReveal } from "./motion-system";

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
      <div className="absolute -inset-6 rounded-full bg-[var(--brand-primary)]/20 blur-3xl" />

      {/* gentle float */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-[2.6rem] border [border-color:var(--mk-border-strong)] p-2.5 shadow-2xl shadow-black/60 [background:var(--mk-bg)]"
      >
        {/* notch */}
        <div className="absolute top-2.5 left-1/2 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl [background:var(--mk-bg)]" />

        <div className="relative aspect-[9/19] overflow-hidden rounded-[2.1rem] bg-gradient-to-b from-[var(--mk-surface)] to-[var(--mk-bg)]">
          {/* status bar */}
          <div className="flex items-center justify-between px-5 pt-3 font-mono text-xs [color:var(--mk-text-muted)]">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-[var(--brand-primary)]" /> Σ
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
            className="mx-4 flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] px-3 py-2 [background:var(--mk-bg)]"
          >
            <Search size={12} className="text-[var(--signal-blue)]" />
            <span className="text-xs [color:var(--mk-text-muted)]">
              {UI_STRINGS[lang].askYourBrain}
            </span>
          </motion.div>

          {/* answer card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.45 }}
            className="mx-4 mt-3 rounded-xl border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/[0.05] p-3"
          >
            <p className="mb-2 text-xs leading-relaxed [color:var(--mk-text-muted)]">
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
                className="mb-1 flex items-center gap-1.5"
              >
                <span className="h-1 w-1 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                <span
                  className="h-1.5 rounded-full [background:var(--mk-border-strong)]"
                  style={{ width: `${70 - i * 12}%` }}
                />
              </motion.div>
            ))}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.9, duration: 0.4 }}
              className="mt-2 text-xs [color:var(--signal-amber)] opacity-80"
            >
              {UI_STRINGS[lang].gapWarning}
            </motion.p>
          </motion.div>

          {/* offline chip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 0.4 }}
            className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 [background:var(--mk-surface)]"
          >
            <WifiOff size={10} className="text-[var(--brand-secondary)]" />
            <span className="text-xs [color:var(--mk-text-muted)]">
              {UI_STRINGS[lang].worksOffline}
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
    <div
      data-tone="light"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero — copy left, phone mockup right */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--signal-blue)]/30 bg-[var(--signal-blue)]/10 px-3 py-1.5 text-xs font-medium text-[var(--signal-blue)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--signal-blue)]" />
              {t.badge}
            </div>
            <ClipReveal delay={0.1} duration={0.7} direction="up">
              <h1 className="mb-6 text-[clamp(2.5rem,7vw,4rem)] leading-[1.08] font-black tracking-tight [color:var(--mk-text)]">
                {t.h1a}
                <br />
                <span className="gradient-text glow-text">{t.h1b}</span>
              </h1>
            </ClipReveal>
            <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg lg:mx-0">
              {t.sub}
            </p>

            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              {installEvent ? (
                <Button
                  size="xl"
                  variant="primary"
                  className="min-w-[240px]"
                  onClick={() => installEvent.prompt()}
                >
                  <DownloadIcon size={18} />
                  {UI_STRINGS[lang].installNow}
                </Button>
              ) : (
                <Link href={p(lang, "/signup")} className="inline-flex">
                  <Button size="xl" variant="primary">
                    {UI_STRINGS[lang].getStarted} <ArrowRight size={18} />
                  </Button>
                </Link>
              )}
              <Link href={p(lang, "/features")} className="inline-flex">
                <Button size="xl" variant="secondary">
                  {UI_STRINGS[lang].seeFeatures}
                </Button>
              </Link>
            </div>
          </motion.div>

          <PhoneMockup lang={lang} />
        </div>
      </section>

      {/* Platform cards */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-5 md:grid-cols-3">
          {t.platforms.map((platform, idx) => {
            const Icon = PLATFORM_ICONS[platform.icon] ?? Monitor;
            return (
              <motion.div
                key={platform.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewport}
                transition={{ delay: idx * 0.08, duration: 0.3 }}
              >
                <GlowCard
                  glowColor="var(--signal-blue)"
                  intensity={0.12}
                  className="flex h-full flex-col rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:border-[var(--brand-primary)]/40 hover:[background:var(--mk-hover)]"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--signal-blue)]/20 bg-[var(--signal-blue)]/10 transition-transform duration-300 hover:scale-110">
                    <Icon size={22} className="text-[var(--signal-blue)]" />
                  </div>
                  <h2 className="mb-1 text-lg font-bold [color:var(--mk-text)]">{platform.name}</h2>
                  <p className="mb-5 text-sm font-medium text-[var(--signal-blue)]">
                    {platform.tagline}
                  </p>
                  <ol className="flex-1 space-y-3">
                    {platform.steps.map((step, i) => (
                      <li
                        key={step}
                        className="flex gap-3 text-sm leading-relaxed [color:var(--mk-text-muted)]"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--signal-blue)]/30 bg-[var(--signal-blue)]/20 text-xs font-bold text-[var(--signal-blue)]">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  {platform.note && (
                    <p className="mt-5 border-t [border-color:var(--mk-border)] pt-4 text-xs leading-relaxed [color:var(--mk-text-subtle)]">
                      {platform.note}
                    </p>
                  )}
                </GlowCard>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Store preview */}
      <section className="relative z-10 px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
            {t.storesTitle}
          </h2>
          <p className="mb-8 text-base leading-relaxed [color:var(--mk-text-muted)]">
            {t.storesSub}
          </p>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
            {[
              {
                icon: Bell,
                label: UI_STRINGS[lang].pushNotifications,
              },
              {
                icon: Fingerprint,
                label: UI_STRINGS[lang].biometricUnlock,
              },
              {
                icon: Share2,
                label: UI_STRINGS[lang].sendToSubsumio,
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 text-xs [color:var(--mk-text-muted)] [background:var(--mk-surface)]"
                >
                  <Icon size={13} className="text-[var(--signal-blue)]" /> {f.label}
                </span>
              );
            })}
          </div>

          {/* Store badge placeholders — replace with official badges at store launch */}
          <div className="mb-6 flex items-center justify-center gap-4">
            {["App Store", "Google Play"].map((store) => (
              <div
                key={store}
                aria-disabled="true"
                className="flex items-center gap-3 rounded-xl border border-dashed [border-color:var(--mk-border-strong)] px-6 py-3 opacity-70 select-none [background:var(--mk-bg)]"
              >
                <DownloadIcon size={16} className="[color:var(--mk-text-subtle)]" />
                <div className="text-left">
                  <p className="text-xs tracking-wide [color:var(--mk-text-subtle)] uppercase">
                    {UI_STRINGS[lang].comingSoonTo}
                  </p>
                  <p className="text-sm font-semibold [color:var(--mk-text-muted)]">{store}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mx-auto max-w-xl text-xs leading-relaxed [color:var(--mk-text-subtle)]">
            {t.storesNote}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={t.faqTitle} />
          <AnimatedFaqList items={t.faq} tone="light" />
        </div>
      </section>

      {/* CTA */}
      <section
        data-tone="dark"
        className="relative z-10 mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 lg:px-8"
      >
        <SubsumioMark size={56} className="mx-auto mb-7" />
        <h2 className="mb-4 text-2xl font-black [color:var(--mk-text)] md:text-3xl">
          {t.ctaTitle}
        </h2>
        <p className="mb-10 text-base [color:var(--mk-text-muted)] md:text-lg">{t.ctaSub}</p>
        <Link href={p(lang, "/signup")}>
          <Button size="xl" variant="primary">
            {t.ctaButton} <ArrowRight size={18} />
          </Button>
        </Link>
      </section>
    </div>
  );
}
