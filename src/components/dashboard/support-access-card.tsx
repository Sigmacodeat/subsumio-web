"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { csrfFetch } from "@/lib/csrf";

interface Grant {
  mode: "read" | "write";
  createdAt: string;
  expiresAt: string;
  grantedBy: string;
}

interface ActiveSession {
  mode: "read" | "write";
  reason: string;
  startedAt: string;
  expiresAt: string;
  by: string;
}

const DURATIONS: Array<{ hours: number; label: string }> = [
  { hours: 1, label: "1 Stunde" },
  { hours: 8, label: "8 Stunden" },
  { hours: 24, label: "1 Tag" },
  { hours: 72, label: "3 Tage" },
  { hours: 168, label: "7 Tage" },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Support approval of the firm (admins only): Subsumio support can open the
 * firm's data only while an approval is valid and only in its scope.
 */
export function SupportAccessCard() {
  const [loading, setLoading] = useState(true);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [hours, setHours] = useState(24);
  const [mode, setMode] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/support-access");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "");
      setGrant(body?.data?.grant ?? null);
      setSessions(body?.data?.activeSessions ?? []);
      setError(null);
    } catch {
      setError("Der Stand der Support-Freigabe konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function grantAccess() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/settings/support-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, mode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Freigabe fehlgeschlagen.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/settings/support-access", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Widerruf fehlgeschlagen.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5"
      aria-labelledby="support-access-title"
    >
      <div className="flex items-center gap-2">
        <LifeBuoy size={16} className="text-[color:var(--ds-text-muted)]" aria-hidden />
        <h2 id="support-access-title" className="text-sm font-semibold text-[color:var(--ds-text)]">
          Zugriff durch den Subsumio-Support
        </h2>
        {grant ? (
          <Badge variant="default" className="text-xs">
            Freigegeben
          </Badge>
        ) : (
          <Badge variant="default" className="text-xs text-[color:var(--ds-text-muted)]">
            Nicht freigegeben
          </Badge>
        )}
      </div>
      <p className="text-xs text-[color:var(--ds-text-muted)]">
        Der Subsumio-Support kann Ihre Kanzleidaten nur einsehen, solange Sie hier eine Freigabe
        erteilt haben — befristet auf höchstens 7 Tage und jederzeit widerrufbar. Jede
        Support-Sitzung braucht einen Grund, endet spätestens nach 60 Minuten und steht in Ihrem
        Audit-Protokoll. Akten mit eingeschränkter Sichtbarkeit bleiben auch dann geschlossen.
      </p>

      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <>
          {grant ? (
            <div className="space-y-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] px-3 py-3 text-xs text-[color:var(--ds-text)]">
              <p>
                Freigegeben {grant.mode === "write" ? "zum Lesen und Ändern" : "nur zum Lesen"} bis{" "}
                <strong>{fmt(grant.expiresAt)}</strong> (erteilt von {grant.grantedBy}).
              </p>
              <Button
                variant="outline"
                size="sm"
                loading={busy}
                onClick={() => void revoke()}
                data-testid="support-access-revoke"
              >
                Freigabe widerrufen
              </Button>
            </div>
          ) : null}

          {sessions.length > 0 && (
            <div
              role="status"
              className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
            >
              {sessions.map((s) => (
                <p key={s.startedAt}>
                  Laufende Support-Sitzung seit {fmt(s.startedAt)} (
                  {s.mode === "write" ? "mit Schreibrecht" : "nur lesend"}) — Grund: {s.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--ds-text-muted)]">
              Dauer
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-sm text-[color:var(--ds-text)]"
              >
                {DURATIONS.map((d) => (
                  <option key={d.hours} value={d.hours}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--ds-text-muted)]">
              Umfang
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value === "write" ? "write" : "read")}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-sm text-[color:var(--ds-text)]"
              >
                <option value="read">Nur lesen</option>
                <option value="write">Lesen und ändern</option>
              </select>
            </label>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void grantAccess()}
              data-testid="support-access-grant"
            >
              {grant ? "Freigabe ersetzen" : "Freigabe erteilen"}
            </Button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
          {error}
        </p>
      )}
    </section>
  );
}
