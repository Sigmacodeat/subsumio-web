"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { csrfFetch } from "@/lib/csrf";

interface ActiveSession {
  mode?: "read" | "write";
  orgId: string;
  orgName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUBSUMIO_URL || "";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function SupportSessionPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveSession | null>(null);
  // The firm's support approval: sessions start only while it is valid.
  const [grant, setGrant] = useState<{ mode: "read" | "write"; expiresAt: string } | null>(null);
  const [reason, setReason] = useState("");
  const [writeAccess, setWriteAccess] = useState(false);
  const [writeReason, setWriteReason] = useState("");
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/support-session?orgId=${encodeURIComponent(orgId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setActive(body?.data?.session ?? null);
        setGrant(body?.data?.grant ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function start() {
    setError(null);
    if (reason.trim().length < 10) {
      setError("Bitte einen aussagekräftigen Grund angeben (mind. 10 Zeichen).");
      return;
    }
    if (writeAccess && writeReason.trim().length < 10) {
      setError("Schreibzugriff braucht eine eigene Begründung (mind. 10 Zeichen).");
      return;
    }
    setStarting(true);
    try {
      const res = await csrfFetch("/api/admin/support-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          reason: reason.trim(),
          mode: writeAccess ? "write" : "read",
          ...(writeAccess ? { writeReason: writeReason.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Start fehlgeschlagen.");
        return;
      }
      setActive(body?.data?.session ?? null);
      setReason("");
      setWriteAccess(false);
      setWriteReason("");
    } finally {
      setStarting(false);
    }
  }

  async function end() {
    setEnding(true);
    try {
      await csrfFetch("/api/admin/support-session/end", { method: "POST" });
      setActive(null);
    } finally {
      setEnding(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <p className="text-sm text-[color:var(--ds-text-muted)]">Support-Status wird geladen…</p>
      </section>
    );
  }

  const activeForThisOrg = active?.orgId === orgId;

  return (
    <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert size={15} className="text-[color:var(--ds-warning-text)]" aria-hidden />
        Support-Zugriff
      </h2>
      <p className="mb-4 text-xs text-[color:var(--ds-text-muted)]">
        Protokollierter Zugriff auf die Kanzlei-Daten — nur solange die Kanzlei eine
        Support-Freigabe erteilt hat und nur in deren Umfang, mit Pflicht-Grund, für die Kanzlei
        sichtbar im Audit-Log und auf 60 Minuten begrenzt. Standardmäßig nur lesend; Schreibzugriff
        nur mit eigener Begründung und wenn die Freigabe ihn umfasst.
      </p>

      {activeForThisOrg && active ? (
        <div className="space-y-3 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4">
          <p className="text-sm font-medium text-[color:var(--ds-warning-text)]">
            Aktive Sitzung für {orgName} ·{" "}
            {active.mode === "write" ? "mit Schreibrecht" : "nur lesend"}
          </p>
          <dl className="grid gap-1 text-xs text-[color:var(--ds-warning-text)]">
            <div>
              <dt className="inline font-medium">Grund: </dt>
              <dd className="inline">{active.reason}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Gestartet: </dt>
              <dd className="inline">{fmt(active.startedAt)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Endet spätestens: </dt>
              <dd className="inline">{fmt(active.expiresAt)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {APP_URL && (
              <a
                href={`${APP_URL.replace(/\/$/, "")}/dashboard`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-warning-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-warning-solid)] hover:text-white"
              >
                Kanzlei-Dashboard öffnen <ExternalLink size={12} />
              </a>
            )}
            <Button size="sm" variant="outline" loading={ending} onClick={() => void end()}>
              Sitzung beenden
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {active && (
            <p className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]">
              Sie haben bereits eine aktive Sitzung für <strong>{active.orgName}</strong>. Diese
              wird beendet, wenn Sie hier eine neue starten.
            </p>
          )}
          <p
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-2 text-xs"
            data-testid="support-grant-status"
          >
            {grant
              ? `Freigabe der Kanzlei: ${grant.mode === "write" ? "lesen und ändern" : "nur lesen"}, gültig bis ${fmt(grant.expiresAt)}.`
              : "Die Kanzlei hat derzeit keine Support-Freigabe erteilt — ein Zugriff ist nicht möglich."}
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Grund für den Zugriff (z. B. Ticket-Nr., gemeldetes Problem)…"
            rows={2}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              disabled={grant?.mode !== "write"}
              checked={writeAccess}
              onChange={(e) => setWriteAccess(e.target.checked)}
            />
            Schreibzugriff (Standard: nur lesen)
          </label>
          {writeAccess && (
            <Textarea
              value={writeReason}
              onChange={(e) => setWriteReason(e.target.value)}
              placeholder="Warum sind Änderungen nötig? (wird der Kanzlei im Audit-Log angezeigt)…"
              rows={2}
            />
          )}
          {error && <p className="text-xs text-[color:var(--ds-danger-text)]">{error}</p>}
          <Button size="sm" loading={starting} disabled={!grant} onClick={() => void start()}>
            Support-Zugriff starten (60 Min.)
          </Button>
        </div>
      )}
    </section>
  );
}
