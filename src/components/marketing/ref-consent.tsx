"use client";

// § 25 TTDSG referral consent: when a visitor arrives via ?ref=CODE, ask
// before storing the 90-day attribution cookie. Decline is remembered in
// localStorage so the banner never nags. No ?ref= in the URL → renders
// nothing; regular visitors never see this.

import { useEffect, useState } from "react";
import { REF_COOKIE } from "@/lib/auth/session-core";

const CODE_RE = /^[a-z0-9]{4,16}$/;
const DECISION_KEY = "sb_ref_consent"; // "accepted" | "declined"
const REF_COOKIE_MAX_AGE = 90 * 24 * 3600; // 90 days — partner cookie window

function hasRefCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${REF_COOKIE}=`));
}

export default function RefConsentBanner() {
  const [banner, setBanner] = useState<{ code: string; isGerman: boolean } | null>(null);

  useEffect(() => {
    // Deferred so the state update is not synchronous inside the effect
    // (react-hooks/set-state-in-effect) — the banner appearing a tick after
    // hydration is fine.
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (!ref || !CODE_RE.test(ref)) return;
      if (hasRefCookie()) return;
      if (localStorage.getItem(DECISION_KEY)) return;
      setBanner({
        code: ref,
        isGerman: !window.location.pathname.startsWith("/en"),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!banner) return null;
  const { code, isGerman } = banner;

  const accept = () => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${REF_COOKIE}=${code}; Max-Age=${REF_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
    localStorage.setItem(DECISION_KEY, "accepted");
    setBanner(null);
  };

  const decline = () => {
    localStorage.setItem(DECISION_KEY, "declined");
    setBanner(null);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed right-4 bottom-4 left-4 z-[100] rounded-2xl border [border-color:var(--mk-border)] p-5 shadow-2xl shadow-black/60 [background:var(--mk-surface)] sm:left-auto sm:max-w-md"
    >
      <p className="mb-1.5 text-sm font-semibold [color:var(--mk-text)]">
        {isGerman ? "Empfehlungslink erkannt" : "Referral link detected"}
      </p>
      <p className="mb-4 text-xs leading-relaxed [color:var(--mk-text-muted)]">
        {isGerman
          ? "Du bist über eine Empfehlung hier. Dürfen wir den Empfehlungs-Code 90 Tage als Cookie speichern, damit dein Werber seine Provision bekommt und du deinen Gratismonat? Sonst passiert nichts — die Seite funktioniert auch ohne."
          : "You arrived via a referral. May we store the referral code as a cookie for 90 days so your referrer gets their commission and you get your free month? Nothing else happens — the site works fine without it."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={accept}
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hover)]"
        >
          {isGerman ? "Einverstanden" : "Accept"}
        </button>
        <button
          onClick={decline}
          className="rounded-lg border [border-color:var(--mk-border)] px-4 py-2 text-xs font-medium [color:var(--mk-text-muted)] transition-colors hover:[border-color:var(--mk-border-strong)]"
        >
          {isGerman ? "Ablehnen" : "Decline"}
        </button>
      </div>
    </div>
  );
}
