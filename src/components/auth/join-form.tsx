"use client";

// Team-invite confirmation — the explicit click that performs the join.

import { useState } from "react";
import Link from "next/link";
import { Users, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioLogo } from "@/components/brand/subsumio-logo";
import { MarketingBackground } from "@/components/marketing/chrome";
import { p, type Lang } from "@/content/site";

const COPY = {
  en: {
    title: "Join the team",
    sub: "You've been invited to a shared Subsumio — one brain, the whole team's knowledge.",
    invitedAs: "Invitation for:",
    signedInAs: "You are signed in as:",
    cta: "Join team",
    done: (name: string) => `You're in. “${name}” is now your shared brain.`,
    toDashboard: "Open dashboard",
    errors: {
      wrong_account: "This invitation was sent to a different email address. Sign in with the invited account.",
      invalid_or_expired_invite: "This invitation is invalid or expired. Ask for a new one.",
      leave_current_org_first: "You're already in a team. Leave it first (Dashboard → Team).",
      no_seats_left: "This team has no free seats left. The owner needs to upgrade or free a seat.",
      generic: "Something went wrong. Please try again.",
    } as Record<string, string>,
  },
  de: {
    title: "Dem Team beitreten",
    sub: "Du wurdest zu einem geteilten Subsumio eingeladen — ein Brain, das Wissen des ganzen Teams.",
    invitedAs: "Einladung für:",
    signedInAs: "Du bist angemeldet als:",
    cta: "Team beitreten",
    done: (name: string) => `Du bist drin. „${name}“ ist jetzt euer gemeinsames Brain.`,
    toDashboard: "Dashboard öffnen",
    errors: {
      wrong_account: "Diese Einladung ging an eine andere E-Mail-Adresse. Melde dich mit dem eingeladenen Konto an.",
      invalid_or_expired_invite: "Diese Einladung ist ungültig oder abgelaufen. Bitte um eine neue.",
      leave_current_org_first: "Du bist bereits in einem Team. Verlasse es zuerst (Dashboard → Team).",
      no_seats_left: "Dieses Team hat keine freien Plätze mehr. Der Inhaber muss upgraden oder einen Platz freimachen.",
      generic: "Etwas ist schiefgelaufen. Bitte versuch es erneut.",
    } as Record<string, string>,
  },
} as const;

export default function JoinForm({
  token,
  org,
  email,
  myEmail,
  lang,
}: {
  token: string;
  org: string;
  email: string;
  myEmail: string;
  lang: Lang;
}) {
  const t = COPY[lang];
  const [error, setError] = useState<string | null>(
    !token || !org || !email ? t.errors.invalid_or_expired_invite : null,
  );
  const [doneName, setDoneName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function join() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/org/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, org, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t.errors[data.error] ?? t.errors.generic);
        setLoading(false);
        return;
      }
      setDoneName(data.org?.name ?? "Team");
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
          <Users size={22} className="text-[var(--brand-primary)] mb-4" aria-hidden />
          <h1 className="text-2xl font-black text-[#e8e8f0] mb-1">{t.title}</h1>
          <p className="text-sm text-[#8888aa] mb-6">{t.sub}</p>

          {doneName ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-[#a8a8be]">{t.done(doneName)}</p>
              </div>
              <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-primary)] hover:underline">
                {t.toDashboard} <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <dl className="text-xs text-[#8888aa] space-y-1.5 p-4 rounded-xl border border-[#1e1e3a] bg-[#0a0a18]">
                <div className="flex justify-between gap-4">
                  <dt>{t.invitedAs}</dt>
                  <dd className="text-[#e8e8f0] font-mono">{email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{t.signedInAs}</dt>
                  <dd className="text-[#e8e8f0] font-mono">{myEmail}</dd>
                </div>
              </dl>

              {error && (
                <div role="alert" className="flex items-start gap-2.5 p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5">
                  <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" aria-hidden />
                  <p className="text-sm text-rose-300">{error}</p>
                </div>
              )}

              <Button onClick={join} variant="glow" size="md" className="w-full" disabled={loading || !token}>
                {t.cta} <ArrowRight size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
