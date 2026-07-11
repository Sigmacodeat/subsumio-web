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
  Mail,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { DOWNLOAD } from "@/content/download";
import { Section, SectionHeading, PageHero, CTASection, IconTile } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { GlowCard, StaggerContainer, StaggerItem } from "./motion-system";

const PLATFORM_ICONS: Record<string, LucideIcon> = { Apple, Smartphone, Monitor };

function NotifyMe({ lang }: { lang: Lang }) {
  const [email, setEmail] = useState("");
  const isDe = lang === "de" || lang === "at" || lang === "ch";
  const label = isDe ? "App-Launch Benachrichtigung" : "App launch notification";
  const placeholder = isDe ? "Deine E-Mail-Adresse" : "Your email address";
  const button = isDe ? "Benachrichtige mich" : "Notify me";
  const privacy = isDe
    ? "Kein Spam. Wir schreiben dich an, sobald die Store-Apps live sind."
    : "No spam. We will email you once store apps are available.";
  return (
    <form
      className="mx-auto max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email) return;
        const subject = isDe ? "App-Launch Benachrichtigung" : "App launch notification";
        window.location.href = `mailto:hello@subsum.eu?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(email)}`;
      }}
    >
      <label
        htmlFor="notify-email"
        className="mb-2 block text-sm font-medium [color:var(--mk-text)]"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="notify-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          required
          className="flex-1 rounded-xl border [border-color:var(--mk-control-border)] px-4 py-3 text-sm [color:var(--mk-text)] [background:var(--mk-surface)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[color:var(--mk-focus-ring)] focus:ring-2 focus:ring-[var(--mk-focus-ring)] focus:outline-none"
        />
        <Button type="submit" className="gap-2">
          <Mail size={16} />
          {button}
        </Button>
      </div>
      <p className="mt-2 text-xs [color:var(--mk-text-subtle)]">{privacy}</p>
    </form>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

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
          <div className="flex items-center justify-between px-5 pt-3 font-mono text-sm [color:var(--mk-text-muted)]">
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
            <Search size={12} className="brand-text" />
            <span className="text-sm [color:var(--mk-text-muted)]">
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
            <p className="mb-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
              {UI_STRINGS[lang].downloadHint}
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
              className="mt-2 text-sm [color:var(--signal-amber)]"
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
            <span className="text-sm [color:var(--mk-text-muted)]">
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
      className="min-h-screen overflow-x-clip [background:var(--mk-bg)]"
      lang={lang}
    >
      {/* Hero — copy left, phone mockup right */}
      <PageHero
        badge={t.badge}
        h1a={t.h1a}
        h1b={t.h1b}
        sub={t.sub}
        accentVariant="gradient"
        actions={
          <>
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
          </>
        }
        visual={<PhoneMockup lang={lang} />}
      />

      {/* Platform cards */}
      <Section tone="light" className="px-4 pb-20 sm:px-6 lg:px-8">
        <StaggerContainer className="grid gap-6 md:grid-cols-3" stagger={0.08}>
          {t.platforms.map((platform) => {
            const Icon = PLATFORM_ICONS[platform.icon] ?? Monitor;
            return (
              <StaggerItem key={platform.id}>
                <GlowCard
                  glowColor="var(--brand-primary)"
                  intensity={0.12}
                  className="flex h-full flex-col rounded-2xl border [border-color:var(--mk-border)] p-6 transition-all [background:var(--mk-surface)] hover:-translate-y-1 hover:border-[var(--brand-primary)]/40 hover:[background:var(--mk-hover)]"
                >
                  <IconTile icon={Icon} size={22} className="mb-5" />
                  <h3 className="mb-1 text-lg font-bold [color:var(--mk-text)]">{platform.name}</h3>
                  <p className="brand-text mb-5 text-sm font-medium">{platform.tagline}</p>
                  <ol className="flex-1 space-y-3">
                    {platform.steps.map((step, i) => (
                      <li
                        key={step}
                        className="flex gap-3 text-sm leading-relaxed [color:var(--mk-text-muted)]"
                      >
                        <span className="brand-text mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--brand-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_20%,transparent)] text-sm font-bold">
                          {i + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  {platform.note && (
                    <p className="mt-5 border-t [border-color:var(--mk-border)] pt-4 text-sm leading-relaxed [color:var(--mk-text-subtle)]">
                      {platform.note}
                    </p>
                  )}
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </Section>

      {/* Store preview */}
      <Section tone="light" className="px-4 py-20 [background:var(--mk-surface)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading title={t.storesTitle} sub={t.storesSub} />

          <div className="mb-8 flex flex-wrap items-center justify-center gap-6">
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
                  className="inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 text-sm [color:var(--mk-text-muted)] [background:var(--mk-surface)]"
                >
                  <Icon size={13} className="brand-text" /> {f.label}
                </span>
              );
            })}
          </div>

          {/* Notify me when store apps launch */}
          <div className="mb-6">
            <NotifyMe lang={lang} />
          </div>
          <p className="mx-auto max-w-xl text-sm leading-relaxed [color:var(--mk-text-subtle)]">
            {t.storesNote}
          </p>
        </div>
      </Section>

      {/* FAQ */}
      <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading title={t.faqTitle} />
          <AnimatedFaqList items={t.faq} tone="light" />
        </div>
      </Section>

      {/* CTA */}
      <CTASection
        title={t.ctaTitle}
        sub={t.ctaSub}
        href={p(lang, "/signup")}
        label={t.ctaButton}
        secondaryHref={p(lang, "/contact")}
        secondaryLabel={UI_STRINGS[lang].writeUs}
      />
    </div>
  );
}
