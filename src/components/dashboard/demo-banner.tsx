"use client";

/**
 * Fixed top banner shown for the whole public live-demo session. Carries
 * the fictional-data disclosure, the live question-budget counter, the
 * session expiry, the signup CTA and — once the budget is exhausted — the
 * progressive e-mail gate (unlocks more questions + creates a sales lead).
 *
 * Rendered fixed like the support-session banner; the dashboard shell
 * offsets itself via paddingTop (see dashboard/layout.tsx).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FlaskConical, Mail, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { useMe } from "@/lib/queries/auth";
import {
  useDemoSession,
  useDemoReset,
  useDemoGate,
  demoBeacon,
  type DemoSessionState,
} from "@/lib/queries/demo";
import { DemoTour } from "@/components/dashboard/demo-tour";
import { DEMO_QUESTIONS_FREE } from "@/content/demo-matter";
import { tracking } from "@/lib/tracking";

/**
 * CSS variable the dashboard shell uses for its top padding while the demo
 * banner is visible. Measured (ResizeObserver) rather than a constant so the
 * banner may wrap to two rows on narrow screens without covering content.
 */
export const DEMO_BANNER_HEIGHT_VAR = "--demo-banner-h";

/**
 * Demo chrome mounted by the dashboard layout: fixed banner + guided tour.
 * Renders nothing for regular users; for demo sessions it pulls the live
 * session state (question budget, expiry, ingest flag) from
 * GET /api/demo/session every 15s.
 */
export function DemoChrome() {
  const me = useMe();
  const isDemo = Boolean(me.data?.demo);
  const q = useDemoSession(isDemo);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty(DEMO_BANNER_HEIGHT_VAR, `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty(DEMO_BANNER_HEIGHT_VAR);
    };
  }, [isDemo]);

  if (!isDemo) return null;
  const demo = q.data?.demo ? q.data : null;
  if (!demo) return null;

  return (
    <>
      <div ref={bannerRef} className="fixed inset-x-0 top-0 z-[100]">
        <DemoBanner demo={demo} />
      </div>
      <DemoTour demo={demo} />
    </>
  );
}

function useCountdown(expiresAt?: string): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) return setLabel("0:00");
      const m = Math.floor(ms / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(`${m}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return label;
}

export function DemoBanner({ demo }: { demo: DemoSessionState }) {
  const { t } = useLang();
  const { addToast } = useToast();
  const reset = useDemoReset();
  const gate = useDemoGate();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [gateEmail, setGateEmail] = useState("");
  const countdown = useCountdown(demo.expiresAt);

  const used = demo.questionsUsed ?? 0;
  const cap = demo.questionsCap ?? DEMO_QUESTIONS_FREE;
  const exhausted = used >= cap;
  const gated = cap > DEMO_QUESTIONS_FREE; // e-mail gate already passed
  const showGate = exhausted && !gated;

  useEffect(() => {
    if (showGate) tracking.demo?.gateShown();
  }, [showGate]);

  async function onReset() {
    try {
      await reset.mutateAsync();
      setConfirmingReset(false);
      tracking.demo?.reset();
      addToast({
        type: "success",
        title: "Demo zurückgesetzt",
        description: "Frische Akte geladen.",
      });
    } catch {
      addToast({ type: "error", title: "Fehler", description: "Reset fehlgeschlagen." });
    }
  }

  async function onGate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await gate.mutateAsync(gateEmail.trim());
      tracking.demo?.gatePassed();
      addToast({
        type: "success",
        title: "Freigeschaltet",
        description: "15 weitere Demofragen sind aktiv.",
      });
    } catch {
      addToast({ type: "error", title: "Fehler", description: "Freischaltung fehlgeschlagen." });
    }
  }

  return (
    <div
      role="region"
      aria-label="Live-Demo"
      className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--brand-primary)]/25 bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs md:px-4"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--brand-primary)]">
        <FlaskConical size={14} aria-hidden />
        {t("demo.banner.badge")}
      </span>
      <span className="hidden text-[color:var(--ds-text-subtle)] sm:inline">
        {t("demo.banner.subtitle")}
      </span>

      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ds-surface-2,var(--ds-bg))] px-2 py-0.5 text-[color:var(--ds-text)] tabular-nums"
      >
        {t("demo.banner.questions")} {used}/{cap}
      </span>

      {countdown && (
        <span className="hidden items-center gap-1 text-[color:var(--ds-text-subtle)] md:inline-flex">
          <Timer size={12} aria-hidden />
          {t("demo.banner.expires_in")} {countdown}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {showGate ? (
          <form onSubmit={onGate} className="flex items-center gap-1.5">
            <label htmlFor="demo-gate-email" className="sr-only">
              {t("demo.gate.email")}
            </label>
            <Input
              id="demo-gate-email"
              type="email"
              required
              value={gateEmail}
              onChange={(e) => setGateEmail(e.target.value)}
              placeholder={t("demo.gate.email")}
              className="h-7 w-44 text-xs"
            />
            <Button type="submit" size="sm" disabled={gate.isPending} className="h-7 gap-1 text-xs">
              <Mail size={12} aria-hidden />
              {t("demo.gate.cta")}
            </Button>
          </form>
        ) : null}

        <Button asChild size="sm" className="h-7 text-xs">
          <Link
            href="/signup?from=demo"
            onClick={() => {
              tracking.demo?.ctaClicked("banner");
              demoBeacon("cta", { place: "banner" });
            }}
          >
            {t("demo.banner.cta")}
          </Link>
        </Button>

        {confirmingReset ? (
          <span className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="danger"
              className="h-7 text-xs"
              disabled={reset.isPending}
              onClick={() => void onReset()}
            >
              {t("demo.banner.reset")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setConfirmingReset(false)}
            >
              ✕
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-[color:var(--ds-text-subtle)]"
            onClick={() => setConfirmingReset(true)}
            title={t("demo.banner.reset_confirm")}
          >
            <RotateCcw size={12} aria-hidden />
            <span className="hidden lg:inline">{t("demo.banner.reset")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
