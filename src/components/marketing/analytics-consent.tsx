"use client";

// DSGVO/TTDSG cookie consent banner for analytics (PostHog, Vercel Analytics).
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
    setIsGerman(window.location.pathname === "/de" || window.location.pathname.startsWith("/de/"));
  }, []);

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={isGerman ? "Analytics-Einwilligung" : "Analytics consent"}
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-md z-[99] p-5 rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] shadow-2xl shadow-black/60"
    >
      <p className="text-sm font-semibold [color:var(--mk-text)] mb-1.5">
        {isGerman ? "Analytics-Cookies" : "Analytics cookies"}
      </p>
      <p className="text-xs [color:var(--mk-text-muted)] leading-relaxed mb-4">
        {isGerman
          ? "Wir nutzen PostHog und Vercel Analytics, um die Nutzung der Website anonym zu verstehen und das Produkt zu verbessern. Darf ich ein Cookie dafür setzen? Du kannst jederzeit widerrufen."
          : "We use PostHog and Vercel Analytics to understand website usage anonymously and improve the product. May we set a cookie for that? You can revoke at any time."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={accept}
          className="px-4 py-2 rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-xs font-semibold transition-colors"
        >
          {isGerman ? "Einverstanden" : "Accept"}
        </button>
        <button
          onClick={decline}
          className="px-4 py-2 rounded-lg border [border-color:var(--mk-border)] hover:[border-color:var(--mk-border-strong)] [color:var(--mk-text-muted)] text-xs font-medium transition-colors"
        >
          {isGerman ? "Ablehnen" : "Decline"}
        </button>
      </div>
    </div>
  );
}
