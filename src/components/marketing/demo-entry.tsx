"use client";

/**
 * /demo entry island — persona pick + one-click start.
 *
 * POSTs /api/demo/session (rate-limited, no CSRF cookie needed — the route
 * is exempt) and redirects into the real dashboard where the visitor's
 * isolated demo source is already populated with the fictional matter
 * "Berger ./. Muster Werk GmbH".
 */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Scale, Briefcase, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tracking } from "@/lib/tracking";
import type { DemoJurisdiction } from "@/content/demo-matter";

type Persona = "lawyer" | "assistant";

const PERSONAS: {
  id: Persona;
  label: string;
  hint: string;
  icon: typeof Scale;
}[] = [
  {
    id: "lawyer",
    label: "Anwältin / Anwalt",
    hint: "Antworten mit Fundstellen, Fristen, Strategie",
    icon: Scale,
  },
  {
    id: "assistant",
    label: "Assistenz / ReNo",
    hint: "Posteingang, Aufnahme, Fristenbuch",
    icon: Briefcase,
  },
];

export function DemoEntry() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  // Deep links for sales/marketing: /demo?persona=assistant&jur=de&ref=max
  const initialPersona: Persona = params.get("persona") === "assistant" ? "assistant" : "lawyer";
  const initialJur: DemoJurisdiction = params.get("jur") === "de" ? "de" : "at";
  const ref = params.get("ref");
  const [persona, setPersona] = useState<Persona>(initialPersona);
  const [jurisdiction, setJurisdiction] = useState<DemoJurisdiction>(initialJur);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Probe the demo health endpoint so a missing template/unreachable engine
  // degrades to a clear message instead of a broken session start.
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (expired) tracking.demo.expired();
  }, [expired]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/demo/health?jur=${jurisdiction}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => {
        if (!cancelled) setAvailable(d.configured === true);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jurisdiction]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ persona, jurisdiction, ref: ref ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        demo?: boolean;
        redirect?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.redirect) {
        setError(
          data.message ??
            "Die Demo ist gerade nicht verfügbar. Bitte versuchen Sie es in wenigen Minuten erneut."
        );
        setBusy(false);
        return;
      }
      tracking.demo.started(persona);
      router.push(data.redirect);
      // keep busy=true — navigation in flight
    } catch {
      setError("Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      {expired && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300"
        >
          Ihre Demo-Session ist abgelaufen (60 Minuten). Starten Sie einfach eine neue — die Akte
          wird frisch geladen.
        </div>
      )}

      <fieldset>
        <legend className="sr-only">Ihre Rolle in der Kanzlei</legend>
        <div role="radiogroup" aria-label="Ihre Rolle" className="grid gap-3 sm:grid-cols-2">
          {PERSONAS.map((p) => {
            const active = persona === p.id;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPersona(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    setPersona(p.id === "lawyer" ? "assistant" : "lawyer");
                  }
                  if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setPersona(p.id === "lawyer" ? "assistant" : "lawyer");
                  }
                }}
                className={`rounded-xl border p-4 text-left transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none ${
                  active
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/[0.06] shadow-sm"
                    : "border-[color:var(--mk-border,var(--ds-border))] hover:-translate-y-0.5 hover:border-[color:var(--brand-primary)]/40 hover:shadow-md"
                }`}
              >
                <Icon
                  size={20}
                  className={
                    active
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--mk-text-subtle,var(--ds-text-subtle))]"
                  }
                  aria-hidden
                />
                <div className="mt-2 text-sm font-semibold">{p.label}</div>
                <div className="mt-0.5 text-xs text-[color:var(--mk-text-subtle,var(--ds-text-subtle))]">
                  {p.hint}
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="sr-only">Rechtsraum der Demo-Akte</legend>
        <div
          role="radiogroup"
          aria-label="Rechtsraum"
          className="inline-flex w-full items-center rounded-xl border border-[color:var(--mk-border,var(--ds-border))] p-1 sm:w-auto"
        >
          {[
            { id: "at" as const, label: "Österreich", hint: "ASG Wien · ERV" },
            { id: "de" as const, label: "Deutschland", hint: "ArbG München · beA" },
          ].map((j) => {
            const active = jurisdiction === j.id;
            return (
              <button
                key={j.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setJurisdiction(j.id)}
                className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none sm:flex-none ${
                  active
                    ? "bg-[color:var(--brand-primary)]/[0.08] font-semibold text-[color:var(--brand-primary)]"
                    : "text-[color:var(--mk-text-subtle,var(--ds-text-subtle))] hover:bg-[color:var(--ds-surface-2,var(--ds-bg))]"
                }`}
              >
                <MapPin size={14} aria-hidden />
                <span>{j.label}</span>
                <span className="hidden text-xs opacity-70 md:inline">{j.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <motion.div whileTap={{ scale: 0.98 }} className="mt-6">
        <Button
          size="lg"
          onClick={() => void start()}
          disabled={busy || available === false}
          className="h-12 w-full gap-2 text-base"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden />
              Demo-Kanzlei wird eröffnet…
            </>
          ) : (
            <>
              Live-Demo öffnen
              <ArrowRight size={18} aria-hidden />
            </>
          )}
        </Button>
      </motion.div>

      {available === false && (
        <p role="status" className="mt-3 text-center text-sm text-amber-600 dark:text-amber-400">
          Die Live-Demo wird gerade vorbereitet — bitte in wenigen Minuten erneut versuchen.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <p className="mt-4 text-center text-xs text-[color:var(--mk-text-subtle,var(--ds-text-subtle))]">
        Die Akte „Berger ./. Muster Werk GmbH“ ist bereits angelegt — Sie landen direkt im
        Dashboard.
      </p>
    </div>
  );
}
