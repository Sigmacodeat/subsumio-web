"use client";

// Password recovery — "forgot" (request the mail) and "reset" (set the new
// password from the emailed token). Mirrors auth-form's glass-card pattern.

import { useState } from "react";
import Link from "next/link";
import { Mail, Lock, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioLogo } from "@/components/brand/subsumio-logo";
import { MarketingBackground } from "@/components/marketing/chrome";
import { p, type Lang } from "@/content/site";

const COPY = {
  en: {
    forgot: {
      title: "Reset your password",
      sub: "Enter your email — if an account exists, we'll send a reset link.",
      cta: "Send reset link",
      done: "If an account exists for this address, a reset link is on its way. Check your inbox (and spam).",
      devNote: "Mail provider not configured — use this direct link:",
    },
    reset: {
      title: "Choose a new password",
      sub: "The link from your email brought you here. Pick a new password.",
      cta: "Set new password",
      done: "Password changed. You can sign in now.",
      confirmMismatch: "Passwords don't match.",
      toLogin: "Go to sign-in",
    },
    email: "Email",
    password: "New password",
    passwordConfirm: "Repeat new password",
    passwordHint: "At least 8 characters",
    backToLogin: "Back to sign-in",
    errors: {
      invalid_email: "Please enter a valid email address.",
      weak_password: "Password must be at least 8 characters.",
      invalid_or_expired_token: "This link is invalid or expired. Request a new one.",
      rate_limited: "Too many attempts. Please wait a moment.",
      generic: "Something went wrong. Please try again.",
    } as Record<string, string>,
  },
  de: {
    forgot: {
      title: "Passwort zurücksetzen",
      sub: "Gib deine E-Mail ein — falls ein Konto existiert, senden wir einen Reset-Link.",
      cta: "Reset-Link senden",
      done: "Falls ein Konto zu dieser Adresse existiert, ist ein Reset-Link unterwegs. Prüfe Posteingang (und Spam).",
      devNote: "Mail-Provider nicht konfiguriert — nutze diesen Direkt-Link:",
    },
    reset: {
      title: "Neues Passwort wählen",
      sub: "Der Link aus deiner E-Mail hat dich hierher gebracht. Wähle ein neues Passwort.",
      cta: "Neues Passwort setzen",
      done: "Passwort geändert. Du kannst dich jetzt anmelden.",
      confirmMismatch: "Die Passwörter stimmen nicht überein.",
      toLogin: "Zur Anmeldung",
    },
    email: "E-Mail",
    password: "Neues Passwort",
    passwordConfirm: "Neues Passwort wiederholen",
    passwordHint: "Mindestens 8 Zeichen",
    backToLogin: "Zurück zur Anmeldung",
    errors: {
      invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
      weak_password: "Das Passwort braucht mindestens 8 Zeichen.",
      invalid_or_expired_token: "Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen an.",
      rate_limited: "Zu viele Versuche. Bitte warte einen Moment.",
      generic: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
    } as Record<string, string>,
  },
} as const;

export default function RecoveryForm({ mode, lang }: { mode: "forgot" | "reset"; lang: Lang }) {
  const t = COPY[lang];
  const m = t[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "reset" && password !== confirm) {
      setError(COPY[lang].reset.confirmMismatch);
      return;
    }

    setLoading(true);
    try {
      const token =
        mode === "reset" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "forgot" ? { email } : { token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t.errors[data.error] ?? t.errors.generic);
        setLoading(false);
        return;
      }
      if (data.devResetUrl) setDevResetUrl(data.devResetUrl);
      setDone(true);
      setLoading(false);
    } catch {
      setError(t.errors.generic);
      setLoading(false);
    }
  }

  return (
    <div data-tone="dark" className="min-h-screen bg-[#06060f] flex items-center justify-center px-6 py-12" lang={lang}>
      <MarketingBackground />
      <div className="relative z-10 w-full max-w-md">
        <Link href={p(lang, "")} className="flex justify-center mb-8" aria-label="Subsumio home">
          <SubsumioLogo size={38} />
        </Link>

        <div className="glass rounded-2xl p-8 shadow-2xl shadow-black/50">
          <h1 className="text-2xl font-black text-[#e8e8f0] mb-1">{m.title}</h1>
          <p className="text-sm text-[#8888aa] mb-7">{m.sub}</p>

          {done ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-[#a8a8be] leading-relaxed">{m.done}</p>
              </div>
              {devResetUrl && (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                  <p className="text-xs text-amber-300 mb-2">{COPY[lang].forgot.devNote}</p>
                  <a href={devResetUrl} className="text-xs text-[var(--brand-primary)] hover:underline break-all">
                    {devResetUrl}
                  </a>
                </div>
              )}
              <Link href={p(lang, "/login")} className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-primary)] hover:underline">
                {mode === "reset" ? COPY[lang].reset.toLogin : t.backToLogin} <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && (
                <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5">
                  <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-300">{error}</p>
                </div>
              )}

              {mode === "forgot" ? (
                <label className="block">
                  <span className="text-xs font-medium text-[#8888aa] mb-1.5 block">{t.email}</span>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7878a0]" aria-hidden />
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0a0a18] border border-[#1e1e3a] focus:border-[var(--brand-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 text-sm text-[#e8e8f0]"
                    />
                  </div>
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-[#8888aa] mb-1.5 block">{t.password}</span>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7878a0]" aria-hidden />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0a0a18] border border-[#1e1e3a] focus:border-[var(--brand-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 text-sm text-[#e8e8f0]"
                      />
                    </div>
                    <span className="text-xs text-[#7878a0] mt-1 block">{t.passwordHint}</span>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-[#8888aa] mb-1.5 block">{t.passwordConfirm}</span>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7878a0]" aria-hidden />
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0a0a18] border border-[#1e1e3a] focus:border-[var(--brand-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20 text-sm text-[#e8e8f0]"
                      />
                    </div>
                  </label>
                </>
              )}

              <Button type="submit" variant="glow" size="md" className="w-full" disabled={loading}>
                {m.cta} <ArrowRight size={14} />
              </Button>

              <p className="text-center">
                <Link href={p(lang, "/login")} className="text-xs text-[#8888aa] hover:text-[#e8e8f0]">
                  {t.backToLogin}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
