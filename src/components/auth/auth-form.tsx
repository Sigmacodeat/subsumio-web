"use client";

// Login + Signup — one component, two modes, two languages.
// Glass card on the marketing background; full keyboard / screen-reader support.
// v2: adds WorkOS SSO buttons (Microsoft, Google).

import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, User as UserIcon, ArrowRight, AlertCircle, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioLogo } from "@/components/brand/subsumio-logo";
import { MarketingBackground } from "@/components/marketing/chrome";
import { p, type Lang } from "@/content/site";
import { styleForIndustry } from "@/lib/industry-theme";
import { ClipReveal, MagneticButton, StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";

const COPY = {
  en: {
    login: {
      title: "Welcome back",
      sub: "Your legal workspace kept working while you were gone.",
      cta: "Sign in",
      switchText: "No account yet?",
      switchCta: "Start free",
    },
    signup: {
      title: "Start Subsumio",
      sub: "Legal software for matters, deadlines and cited AI.",
      cta: "Create account",
      switchText: "Already have an account?",
      switchCta: "Sign in",
    },
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters",
    name: "Name",
    errors: {
      invalid_credentials: "Email or password is incorrect.",
      email_taken: "An account with this email already exists.",
      weak_password: "Password must be at least 8 characters.",
      invalid_email: "Please enter a valid email address.",
      invalid_name: "Please enter your name.",
      sso_required: "Please use the Microsoft or Google button to sign in.",
      generic: "Something went wrong. Please try again.",
    } as Record<string, string>,
    referralNote: "You were referred — your first month on a paid plan is free.",
  },
  de: {
    login: {
      title: "Willkommen zurück",
      sub: "Dein Legal Workspace hat weitergearbeitet, während du weg warst.",
      cta: "Anmelden",
      switchText: "Noch kein Konto?",
      switchCta: "Kostenlos starten",
    },
    signup: {
      title: "Subsumio starten",
      sub: "Legal Software für Akten, Fristen und recherchierte Antworten mit Fundstellen.",
      cta: "Konto erstellen",
      switchText: "Schon ein Konto?",
      switchCta: "Anmelden",
    },
    email: "E-Mail",
    password: "Passwort",
    passwordHint: "Mindestens 8 Zeichen",
    name: "Name",
    errors: {
      invalid_credentials: "E-Mail oder Passwort ist falsch.",
      email_taken: "Ein Konto mit dieser E-Mail existiert bereits.",
      weak_password: "Das Passwort braucht mindestens 8 Zeichen.",
      invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
      invalid_name: "Bitte gib deinen Namen ein.",
      sso_required: "Bitte nutze die Microsoft- oder Google-Anmeldung.",
      generic: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
    } as Record<string, string>,
    referralNote: "Du wurdest empfohlen — dein erster Monat auf einem Bezahlplan ist gratis.",
  },
} as const;

function AuthFormInner({ mode, lang }: { mode: "login" | "signup"; lang: Lang }) {
  const t = COPY[lang];
  const m = t[mode];
  const router = useRouter();
  const params = useSearchParams();
  // Pricing-tier CTAs deep-link with ?plan=pro|team → after signup, land on
  // billing with auto-checkout for that plan. Explicit ?next= wins.
  const planParam = params.get("plan");
  const planNext =
    planParam === "pro" || planParam === "team" ? `/dashboard/billing?checkout=${planParam}` : null;
  const next = params.get("next") || planNext || "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const industry = "legal";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoConfigured, setSsoConfigured] = useState(false);

  useEffect(() => {
    // Probe whether WorkOS SSO is configured
    fetch("/api/auth/sso/workos")
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => setSsoConfigured(data.configured === true))
      .catch(() => setSsoConfigured(false));
  }, []);

  async function startSso(provider: "MicrosoftOAuth" | "GoogleOAuth") {
    setSsoLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/sso/workos?provider=${provider}`);
      const data = (await res.json()) as { authUrl?: string; error?: string };
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError(data.error ?? t.errors.generic);
      }
    } catch {
      setError(t.errors.generic);
    } finally {
      setSsoLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup"
            ? { name, email, password, locale: lang, industry }
            : { email, password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t.errors[data.error] ?? t.errors.generic);
        setLoading(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError(t.errors.generic);
      setLoading(false);
    }
  }

  return (
    <div
      data-tone="dark"
      className="flex min-h-screen items-center justify-center px-6 py-12 [background:var(--mk-bg)]"
      lang={lang}
      style={styleForIndustry(industry)}
    >
      <MarketingBackground />
      <div className="relative z-10 w-full max-w-md">
        <StaggerContainer className="flex flex-col items-center">
          <StaggerItem>
            <Link href={p(lang, "")} className="mb-8 flex justify-center" aria-label="Subsumio home">
              <SubsumioLogo size={40} />
            </Link>
          </StaggerItem>
        </StaggerContainer>

        <div className="glass rounded-2xl p-8 shadow-2xl shadow-black/50">
          <ClipReveal delay={0.1} duration={0.6} direction="up">
            <h1 className="mb-1 text-2xl font-black [color:var(--mk-text)]">{m.title}</h1>
          </ClipReveal>
          <ClipReveal delay={0.2} duration={0.6} direction="up">
            <p className="mb-7 text-sm [color:var(--mk-text-muted)]">{m.sub}</p>
          </ClipReveal>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
                  {t.name}
                </span>
                <div className="relative">
                  <UserIcon
                    size={14}
                    className="absolute top-1/2 left-3 -translate-y-1/2 [color:var(--mk-text-subtle)]"
                    aria-hidden
                  />
                  <input
                    type="text"
                    name="name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="focus:brand-border/60 w-full rounded-lg border [border-color:var(--mk-border)] py-2.5 pr-3 pl-9 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:text-[color:var(--mk-text-subtle)] focus:outline-none"
                  />
                </div>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
                {t.email}
              </span>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 [color:var(--mk-text-subtle)]"
                  aria-hidden
                />
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border [border-color:var(--mk-border)] py-2.5 pr-3 pl-9 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium [color:var(--mk-text-muted)]">
                {t.password}
              </span>
              <div className="relative">
                <Lock
                  size={14}
                  className="absolute top-1/2 left-3 -translate-y-1/2 [color:var(--mk-text-subtle)]"
                  aria-hidden
                />
                <input
                  type="password"
                  name="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border [border-color:var(--mk-border)] py-2.5 pr-3 pl-9 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] placeholder:text-[color:var(--mk-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none"
                />
              </div>
              {mode === "signup" && (
                <span className="mt-1 block text-xs [color:var(--mk-text-subtle)]">
                  {t.passwordHint}
                </span>
              )}
              {mode === "login" && (
                <Link
                  href={p(lang, "/forgot")}
                  className="mt-1.5 inline-block text-xs text-[var(--brand-primary)] hover:underline"
                >
                  {lang === "de" ? "Passwort vergessen?" : "Forgot password?"}
                </Link>
              )}
            </label>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <MagneticButton strength={0.2} className="w-full">
              <Button type="submit" variant="glow" size="lg" className="w-full" loading={loading}>
                {m.cta} <ArrowRight size={15} />
              </Button>
            </MagneticButton>
          </form>

          {ssoConfigured && (
            <div className="mt-5">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t [border-color:var(--mk-border)]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 [color:var(--mk-text-subtle)] [background:var(--mk-surface-2)]">
                    {lang === "de" ? "oder" : "or"}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => startSso("MicrosoftOAuth")}
                  disabled={ssoLoading}
                  className="flex items-center justify-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-3 py-2.5 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface-2)] hover:[border-color:var(--mk-border-strong)] hover:[background:var(--mk-surface)] disabled:opacity-50"
                >
                  <Building2 size={16} className="text-blue-400" />
                  Microsoft
                </button>
                <button
                  type="button"
                  onClick={() => startSso("GoogleOAuth")}
                  disabled={ssoLoading}
                  className="flex items-center justify-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-3 py-2.5 text-sm [color:var(--mk-text)] transition-all [background:var(--mk-surface-2)] hover:[border-color:var(--mk-border-strong)] hover:[background:var(--mk-surface)] disabled:opacity-50"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.05-3.71 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Google
                </button>
              </div>
              {ssoLoading && (
                <p className="mt-2 text-center text-xs [color:var(--mk-text-subtle)]">
                  {lang === "de" ? "Weiterleitung zum Anbieter..." : "Redirecting to provider..."}
                </p>
              )}
            </div>
          )}

          <ClipReveal delay={0.3} duration={0.5} direction="up">
            <p className="mt-6 text-center text-xs [color:var(--mk-text-muted)]">
              {m.switchText}{" "}
              <Link
                href={`${p(lang, mode === "login" ? "/signup" : "/login")}${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="font-medium text-[var(--brand-primary)] hover:underline"
              >
                {m.switchCta}
              </Link>
            </p>
          </ClipReveal>
        </div>
      </div>
    </div>
  );
}

export default function AuthForm(props: { mode: "login" | "signup"; lang: Lang }) {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense
      fallback={<div className="min-h-screen [background:var(--mk-bg)]" data-tone="dark" />}
    >
      <AuthFormInner {...props} />
    </Suspense>
  );
}
