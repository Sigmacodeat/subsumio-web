"use client";

// DSGVO/TTDSG cookie consent banner for analytics (PostHog).
// Shows on first visit, asks for consent before setting non-essential cookies.
// Decision is stored in localStorage (sb_analytics_consent) — no cookie needed.
// § 25 TTDSG: consent must be voluntary, informed, and revocable.

import { useEffect, useState, useCallback } from "react";

const CONSENT_KEY = "sb_analytics_consent"; // "accepted" | "declined" | null

export type AnalyticsConsent = "accepted" | "declined" | null;

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CONSENT_KEY) as AnalyticsConsent | null;
}

export function setAnalyticsConsent(choice: "accepted" | "declined") {
  localStorage.setItem(CONSENT_KEY, choice);
  window.dispatchEvent(new CustomEvent("analytics-consent-change", { detail: choice }));
}

export function useAnalyticsConsent() {
  const [consent, setConsent] = useState<AnalyticsConsent>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const existing = getAnalyticsConsent();
    setConsent(existing);
    setShowBanner(existing === null);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AnalyticsConsent;
      setConsent(detail);
      setShowBanner(false);
    };
    window.addEventListener("analytics-consent-change", handler);
    return () => window.removeEventListener("analytics-consent-change", handler);
  }, []);

  const accept = useCallback(() => {
    setAnalyticsConsent("accepted");
  }, []);

  const decline = useCallback(() => {
    setAnalyticsConsent("declined");
  }, []);

  return { consent, showBanner, accept, decline };
}

export default function AnalyticsConsentBanner() {
  const { showBanner, accept, decline } = useAnalyticsConsent();
  const [isGerman, setIsGerman] = useState(false);

  useEffect(() => {
    setIsGerman(!window.location.pathname.startsWith("/en"));
  }, []);

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={isGerman ? "Analytics-Einwilligung" : "Analytics consent"}
      className="fixed right-3 bottom-3 left-3 z-[99] rounded-xl border [border-color:var(--mk-border)] p-3 shadow-xl shadow-black/35 [background:var(--mk-surface)] sm:left-auto sm:max-w-sm sm:p-4"
    >
      <p className="mb-1 text-xs font-semibold [color:var(--mk-text)] sm:text-sm">
        {isGerman ? "Analytics-Cookies" : "Analytics cookies"}
      </p>
      <p className="mb-3 text-[11px] leading-relaxed [color:var(--mk-text-muted)] sm:text-xs">
        {isGerman
          ? "Wir nutzen PostHog, um die Website anonym zu verbessern. Du kannst jederzeit widerrufen."
          : "We use PostHog to improve the site anonymously. You can revoke consent at any time."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={accept}
          className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hover)]"
        >
          {isGerman ? "Einverstanden" : "Accept"}
        </button>
        <button
          onClick={decline}
          className="rounded-md border [border-color:var(--mk-border)] px-3 py-1.5 text-xs font-medium [color:var(--mk-text-muted)] transition-colors hover:[border-color:var(--mk-border-strong)]"
        >
          {isGerman ? "Ablehnen" : "Decline"}
        </button>
      </div>
    </div>
  );
}
