"use client";

// Blocking one-time confirmation of AGB, Datenschutzerklärung and — for firm
// administrators — the AVV (Art. 28 DSGVO, electronic form per Art. 28 (9)).
// Shown when GET /api/auth/me reports legal.required (accounts from before
// the signup confirmation existed, or after a legal text changed). The record
// is written server-side by POST /api/auth/legal-acceptance.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import { api } from "@/lib/api";

export interface LegalState {
  required: boolean;
  bindsFirm: boolean;
  versions: { terms: string; privacy: string; dpa: string };
}

const LINK = "font-medium text-[var(--brand-text,var(--ds-accent))] underline";

export function LegalAcceptanceGate({ legal }: { legal: LegalState | null | undefined }) {
  const qc = useQueryClient();
  const [terms, setTerms] = useState(false);
  const [dpa, setDpa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!legal?.required) return null;
  const canSubmit = terms && (!legal.bindsFirm || dpa) && !busy;

  async function accept() {
    if (!legal || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/auth/legal-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptTerms: true,
          ...(legal.bindsFirm ? { acceptDpa: true } : {}),
          versions: legal.versions,
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 409
            ? "Die Vertragstexte wurden eben aktualisiert. Bitte laden Sie die Seite neu."
            : "Die Bestätigung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut."
        );
        return;
      }
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch {
      setError("Die Bestätigung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.auth.logout();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      data-testid="legal-acceptance-gate"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-gate-title"
        className="w-full max-w-lg rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-6 shadow-xl"
      >
        <h2 id="legal-gate-title" className="text-lg font-semibold text-[var(--ds-text)]">
          Bitte bestätigen Sie die Vertragsgrundlagen
        </h2>
        <p className="mt-2 text-sm text-[var(--ds-text-muted)]">
          Einmalig vor der weiteren Nutzung
          {legal.bindsFirm ? " — für Ihre Kanzlei schließen Sie dabei den AVV ab" : ""}. Zeitpunkt
          und Fassung werden gespeichert.
        </p>

        <label className="mt-4 flex items-start gap-2 text-sm text-[var(--ds-text)]">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            Ich akzeptiere die{" "}
            <a href="/at/terms" target="_blank" rel="noreferrer" className={LINK}>
              AGB
            </a>{" "}
            und habe die{" "}
            <a href="/at/privacy" target="_blank" rel="noreferrer" className={LINK}>
              Datenschutzerklärung
            </a>{" "}
            gelesen.
          </span>
        </label>

        {legal.bindsFirm && (
          <label className="mt-3 flex items-start gap-2 text-sm text-[var(--ds-text)]">
            <input
              type="checkbox"
              checked={dpa}
              onChange={(e) => setDpa(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Ich schließe im Namen meiner Kanzlei den{" "}
              <a href="/at/dpa" target="_blank" rel="noreferrer" className={LINK}>
                Auftragsverarbeitungsvertrag (AVV)
              </a>{" "}
              nach Art. 28 DSGVO elektronisch ab.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-[color:var(--ds-danger-text)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={logout}
            className="text-sm text-[var(--ds-text-muted)] underline"
          >
            Abmelden
          </button>
          <Button onClick={accept} disabled={!canSubmit} loading={busy}>
            Bestätigen und fortfahren
          </Button>
        </div>
      </div>
    </div>
  );
}
