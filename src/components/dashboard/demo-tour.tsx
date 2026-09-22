"use client";

/**
 * Guided overlay for the public live demo — 3 narrative chapters plus a
 * closing step, rendered as a floating card (bottom sheet on mobile).
 *
 *   1. Ask the matter a question   → /dashboard/chat?q=…   (real answer,
 *      real citations — the aha moment)
 *   2. File the incoming brief     → /dashboard/intake     (DemoIngestCard
 *      runs the intake pipeline visibly)
 *   3. Confirm the AI-detected     → /dashboard/deadlines?ai=1 (HITL
 *      deadline                       review — the trust differentiator)
 *   4. Explore / convert           → /signup?from=demo
 *
 * Steps advance on CTA click and persist in sessionStorage so a reload
 * doesn't restart the story. Escape or ✕ dismisses the tour; the demo
 * itself stays usable.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/use-lang";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import type { DashboardKey } from "@/content/dashboard";
import { demoBeacon, type DemoSessionState } from "@/lib/queries/demo";
import { DEMO_CASE_SLUG, demoSuggestedQuestions } from "@/content/demo-matter";
import { tracking } from "@/lib/tracking";

const STEP_KEY = "subsumio-demo-tour-step";
const DISMISSED_KEY = "subsumio-demo-tour-dismissed";
const STEP_COUNT = 4;

interface Step {
  titleKey: DashboardKey;
  bodyKey: DashboardKey;
  ctaKey: DashboardKey;
  href: string;
  /** External link (signup) — tracked as conversion, not router.push. */
  external?: boolean;
}

function buildSteps(jurisdiction: "at" | "de"): Step[] {
  return [
    {
      titleKey: "demo.tour.step1.title",
      bodyKey: "demo.tour.step1.body",
      ctaKey: "demo.tour.step1.cta",
      href: `/dashboard/chat?case=${encodeURIComponent(DEMO_CASE_SLUG)}&q=${encodeURIComponent(demoSuggestedQuestions(jurisdiction)[0])}`,
    },
    {
      titleKey: "demo.tour.step2.title",
      bodyKey: "demo.tour.step2.body",
      ctaKey: "demo.tour.step2.cta",
      href: "/dashboard/intake?demo=ingest",
    },
    {
      titleKey: "demo.tour.step3.title",
      bodyKey: "demo.tour.step3.body",
      ctaKey: "demo.tour.step3.cta",
      href: "/dashboard/deadlines?ai=1",
    },
    {
      titleKey: "demo.tour.step4.title",
      bodyKey: "demo.tour.step4.body",
      ctaKey: "demo.tour.step4.cta",
      href: "/signup?from=demo",
      external: true,
    },
  ];
}

export function DemoTour({ demo }: { demo: DemoSessionState }) {
  const { t } = useLang();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const STEPS = buildSteps(demo.jurisdiction === "de" ? "de" : "at");

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === "1");
      const stored = Number(sessionStorage.getItem(STEP_KEY) ?? "0");
      setStep(Number.isFinite(stored) ? Math.min(stored, STEP_COUNT - 1) : 0);
    } catch {
      setStep(0);
    }
  }, []);

  // If the brief was already filed (reload mid-tour), skip to chapter 3.
  useEffect(() => {
    if (demo.ingested && step !== null && step === 1) setStep(2);
  }, [demo.ingested, step]);

  // Funnel: every rendered chapter is a "viewed" signal (drop-off analysis).
  useEffect(() => {
    if (step !== null && !dismissed) {
      tracking.demo?.stepViewed(step);
      demoBeacon("tour_step", { step });
    }
  }, [step, dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    tracking.demo?.skipped();
    demoBeacon("tour_skipped", { step: step ?? 0 });
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  if (step === null || dismissed) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function advance() {
    tracking.demo?.stepCompleted(step ?? 0);
    if (s.external) {
      tracking.demo?.ctaClicked("tour");
      demoBeacon("cta", { place: "tour" });
      window.location.href = s.href;
      return;
    }
    const next = Math.min((step ?? 0) + 1, STEP_COUNT - 1);
    setStep(next);
    try {
      sessionStorage.setItem(STEP_KEY, String(next));
    } catch {}
    router.push(s.href);
  }

  return (
    <AnimatePresence>
      <motion.aside
        role="dialog"
        aria-label={t(s.titleKey)}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-md rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-2xl md:inset-x-auto md:right-5 md:bottom-5 md:mx-0 md:w-[380px]"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]">
            <Sparkles size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">{t(s.titleKey)}</h2>
              <button
                type="button"
                onClick={dismiss}
                aria-label={t("demo.tour.skip")}
                className="rounded-md p-1 text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-surface-2,var(--ds-bg))] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ds-text-subtle)]">
              {t(s.bodyKey)}
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-3">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={
                  i <= step
                    ? "h-1 w-6 rounded-full bg-[color:var(--brand-primary)]"
                    : "h-1 w-6 rounded-full bg-[color:var(--ds-border)]"
                }
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isLast && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={dismiss}>
                {t("demo.tour.done")}
              </Button>
            )}
            <Button size="sm" className="text-xs" onClick={advance}>
              {t(s.ctaKey)}
            </Button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
