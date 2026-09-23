"use client";

// Einwilligungs-Hinweis für die Website-Analyse (PostHog).
// Erscheint beim ersten Besuch; PostHog wird erst nach „Einverstanden“ geladen
// und setzt dann Cookies bzw. Einträge im lokalen Speicher. Die Entscheidung
// selbst liegt in localStorage (sb_analytics_consent).
// § 165 Abs. 3 TKG 2021 iVm Art. 6 Abs. 1 lit. a DSGVO: Die Einwilligung muss
// freiwillig, informiert und jederzeit widerrufbar sein — deshalb der Link zur
// Datenschutzerklärung und „Cookie-Einstellungen“ im Seitenfuß
// (openAnalyticsConsentSettings), der den Hinweis erneut öffnet.

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useMarket } from "@/lib/use-market";

const CONSENT_KEY = "sb_analytics_consent"; // "accepted" | "declined" | null
const CHANGE_EVENT = "analytics-consent-change";
const OPEN_EVENT = "analytics-consent-open";

export type AnalyticsConsent = "accepted" | "declined" | null;

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CONSENT_KEY) as AnalyticsConsent | null;
  } catch {
    return null;
  }
}

/**
 * Removes PostHog's own cookies and storage entries (prefix `ph_`). Called on
 * decline/revocation so a withdrawn consent does not leave identifiers behind.
 */
export function clearAnalyticsStorage() {
  if (typeof document === "undefined") return;
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && name.startsWith("ph_")) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname}`;
      const parent = location.hostname.split(".").slice(-2).join(".");
      if (parent !== location.hostname) {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${parent}`;
      }
    }
  }
  try {
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store)) {
        if (key.startsWith("ph_")) store.removeItem(key);
      }
    }
  } catch {
    // Storage blocked — nothing stored there either.
  }
}

export function setAnalyticsConsent(choice: "accepted" | "declined") {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  if (choice === "declined") clearAnalyticsStorage();
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: choice }));
}

/** Öffnet den Einwilligungs-Hinweis erneut (Link „Cookie-Einstellungen“). */
export function openAnalyticsConsentSettings() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
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
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as AnalyticsConsent;
      setConsent(detail);
      setShowBanner(false);
    };
    const onOpen = () => setShowBanner(true);
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
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
  const { consent, showBanner, accept, decline } = useAnalyticsConsent();
  const { p } = useMarket();

  if (!showBanner) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie-Einstellungen"
      className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[99] rounded-xl border [border-color:var(--mk-control-border)] p-3 shadow-xl shadow-black/35 [background:var(--mk-surface)] sm:left-auto sm:max-w-sm sm:p-4"
    >
      <p className="mb-1 text-sm font-semibold [color:var(--mk-text)] sm:text-sm">
        Website-Analyse
      </p>
      <p className="mb-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
        Mit Ihrer Einwilligung nutzen wir PostHog, um zu verstehen, wie diese Website genutzt wird.
        Dabei werden Cookies gesetzt und Nutzungsdaten wie aufgerufene Seiten, Geräteangaben und
        IP-Adresse an PostHog übermittelt. Sie können die Einwilligung jederzeit über
        &bdquo;Cookie-Einstellungen&ldquo; am Seitenende widerrufen. Details in der{" "}
        <Link
          href={p("/privacy")}
          className="[color:var(--mk-text)] underline [text-decoration-color:var(--brand-300)] underline-offset-2 transition-colors hover:[text-decoration-color:var(--brand-200)] motion-reduce:transition-none"
        >
          Datenschutzerklärung
        </Link>
        .
      </p>
      {consent !== null && (
        <p className="mb-3 text-xs [color:var(--mk-text-subtle)]">
          Aktuell: {consent === "accepted" ? "eingewilligt" : "abgelehnt"}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          className="min-h-10 rounded-lg bg-[color:var(--brand-solid)] px-4 py-2 text-sm font-semibold text-white transition-[background-color,border-color,color] hover:bg-[color:var(--brand-solid-hover)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
        >
          Einverstanden
        </button>
        <button
          type="button"
          onClick={decline}
          className="min-h-10 rounded-lg border [border-color:var(--mk-control-border)] px-4 py-2 text-sm font-medium [color:var(--mk-text)] transition-[background-color,border-color,color] hover:[background:var(--mk-hover)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
        >
          {consent === "accepted" ? "Widerrufen" : "Ablehnen"}
        </button>
      </div>
    </div>
  );
}
