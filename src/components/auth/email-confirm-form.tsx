"use client";

// E-mail-change confirmation — landing page for the link mailed to the NEW
// address. The token is only consumed on explicit click: link scanners and
// mail-preview renderers must never silently apply the change.

import { useState } from "react";
import Link from "next/link";
import { Mail, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioLogo } from "@/components/brand/subsumio-logo";
import { MarketingBackground } from "@/components/marketing/chrome";
import { useMarket } from "@/lib/use-market";

const COPY = {
  title: "E-Mail-Adresse bestätigen",
  sub: "Sie sind über den Bestätigungslink aus Ihrer E-Mail hier. Bestätigen Sie die Änderung Ihrer Kontakt-Adresse.",
  cta: "E-Mail-Adresse jetzt ändern",
  confirming: "Wird bestätigt…",
  doneTitle: "E-Mail-Adresse geändert",
  done: "Ihre E-Mail-Adresse wurde geändert. Aus Sicherheitsgründen wurden alle Anmeldungen beendet — bitte melden Sie sich mit der neuen Adresse erneut an.",
  toLogin: "Zur Anmeldung",
  missingToken: "Der Link ist unvollständig. Bitte öffnen Sie ihn direkt aus der E-Mail.",
  errors: {
    invalid_token:
      "Dieser Link ist ungültig, wurde bereits verwendet oder ist abgelaufen. Bitte fordern Sie die Änderung erneut an.",
    email_taken: "Diese E-Mail-Adresse wird inzwischen von einem anderen Konto verwendet.",
    rate_limited: "Zu viele Versuche. Bitte warten Sie einen Moment.",
    generic: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  } as Record<string, string>,
} as const;

export default function EmailConfirmForm() {
  const { p } = useMarket();
  const token =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("token") ?? "")
      : "";
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setState("loading");
    try {
      const res = await fetch("/api/auth/email/confirm-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(COPY.errors[data.error] ?? COPY.errors.generic);
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError(COPY.errors.generic);
      setState("idle");
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4">
      <MarketingBackground />
      <div className="glass-card relative z-10 w-full max-w-md rounded-2xl p-8">
        <div className="mb-6 flex justify-center">
          <SubsumioLogo />
        </div>

        {state === "done" ? (
          <div className="text-center">
            <CheckCircle className="mx-auto mb-4 text-[color:var(--ds-success-text)]" size={40} />
            <h1 className="mb-2 text-xl font-semibold">{COPY.doneTitle}</h1>
            <p className="mb-6 text-sm text-[color:var(--ds-text-muted)]">{COPY.done}</p>
            <Button variant="primary" className="w-full gap-2" asChild>
              <Link href={p("/login")}>
                {COPY.toLogin}
                <ArrowRight size={14} />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex justify-center">
              <Mail className="text-[color:var(--brand-primary)]" size={36} />
            </div>
            <h1 className="mb-2 text-center text-xl font-semibold">{COPY.title}</h1>
            <p className="mb-6 text-center text-sm text-[color:var(--ds-text-muted)]">{COPY.sub}</p>

            {!token ? (
              <div className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {COPY.missingToken}
              </div>
            ) : (
              <>
                {error && (
                  <div
                    role="alert"
                    className="mb-4 flex items-start gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-sm text-[color:var(--ds-danger-text)]"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    {error}
                  </div>
                )}
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={confirm}
                  disabled={state === "loading"}
                  loading={state === "loading"}
                >
                  {state === "loading" ? COPY.confirming : COPY.cta}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
