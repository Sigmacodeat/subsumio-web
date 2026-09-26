"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Download, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/lib/queries/auth";
import { csrfFetch } from "@/lib/csrf";

interface Person {
  id: string;
  name: string;
  email: string;
  role?: string | null;
}
interface LiteracyRecord {
  id: string;
  user_id: string;
  trained_on: string;
  topic: string;
  confirmed_by: string;
}
interface LiteracyData {
  records: LiteracyRecord[];
  members?: Person[];
  missing?: Person[];
}

const QUERY_KEY = ["compliance", "ai-literacy"];

async function loadLiteracy(): Promise<LiteracyData | null> {
  try {
    const res = await fetch("/api/compliance/ai-literacy", { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    return ((await res.json()) as { data: LiteracyData }).data;
  } catch {
    return null;
  }
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}.${m}.${y}` : d;
}

/**
 * Art. 4 KI-VO — KI-Kompetenz: je Mitarbeiter:in ein Schulungsnachweis
 * (Datum, Inhalt, bestätigt von). Admins erfassen und exportieren; alle
 * anderen sehen ihre eigenen Nachweise.
 */
export function AiLiteracySection() {
  const me = useMe();
  const isAdmin = me.data?.user?.role === "admin";
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: loadLiteracy, staleTime: 60_000 });
  const [userId, setUserId] = useState("");
  const [trainedOn, setTrainedOn] = useState("");
  const [topic, setTopic] = useState("");
  const [confirmedBy, setConfirmedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = query.data;
  const names = new Map((data?.members ?? []).map((m) => [m.id, m.name || m.email]));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/compliance/ai-literacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          trained_on: trainedOn,
          topic,
          confirmed_by: confirmedBy,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || "Der Nachweis konnte nicht gespeichert werden.");
      }
      setTopic("");
      setTrainedOn("");
      setUserId("");
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="ai-literacy-title"
      className="space-y-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="ai-literacy-title"
            className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]"
          >
            <GraduationCap size={16} />
            KI-Kompetenz (Art. 4 KI-VO)
          </h2>
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
            Schulungsnachweis je Mitarbeiter:in: Datum, Inhalt, bestätigt von.
          </p>
        </div>
        {isAdmin && (
          <a
            href="/api/compliance/ai-literacy?format=csv"
            className="inline-flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
          >
            <Download size={14} /> CSV
          </a>
        )}
      </div>

      {query.isLoading && <Loader2 size={16} className="animate-spin" aria-label="Lädt" />}
      {!query.isLoading && !data && (
        <p className="text-xs text-[color:var(--ds-danger-text)]">
          Nachweise konnten nicht geladen werden.
        </p>
      )}

      {isAdmin && data?.missing && data.missing.length > 0 && (
        <p
          role="status"
          className="rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2 text-xs text-[color:var(--ds-warning-text)]"
        >
          Ohne Nachweis: {data.missing.map((m) => m.name || m.email).join(", ")}
        </p>
      )}

      {data && data.records.length > 0 && (
        <ul className="divide-y divide-[color:var(--ds-border)] text-xs">
          {data.records.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-3 py-1.5 text-[color:var(--ds-text)]">
              <span className="tabular-nums">{fmtDate(r.trained_on)}</span>
              {isAdmin && <span className="font-medium">{names.get(r.user_id) ?? r.user_id}</span>}
              <span className="min-w-0 flex-1">{r.topic}</span>
              <span className="text-[color:var(--ds-text-muted)]">bestätigt: {r.confirmed_by}</span>
            </li>
          ))}
        </ul>
      )}
      {data && data.records.length === 0 && (
        <p className="text-xs text-[color:var(--ds-text-muted)]">Noch kein Nachweis erfasst.</p>
      )}

      {isAdmin && data?.members && (
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="lit-user">Mitarbeiter:in</Label>
            <select
              id="lit-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-sm"
              required
            >
              <option value="">Bitte wählen</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lit-date">Schulung am</Label>
            <Input
              id="lit-date"
              type="date"
              value={trainedOn}
              onChange={(e) => setTrainedOn(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="lit-topic">Inhalt</Label>
            <Input
              id="lit-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="z. B. Grenzen generativer KI, Zitatprüfung, Datenschutz, Freigabe"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lit-confirmed">Bestätigt von</Label>
            <Input
              id="lit-confirmed"
              value={confirmedBy}
              onChange={(e) => setConfirmedBy(e.target.value)}
              placeholder="Name der verantwortlichen Person"
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Nachweis erfassen
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-[color:var(--ds-danger-text)] sm:col-span-2">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

/** Overview notice for admins: staff who use AI without a training record. */
export function AiLiteracyWarning() {
  const me = useMe();
  const isAdmin = me.data?.user?.role === "admin";
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: loadLiteracy,
    staleTime: 300_000,
    enabled: isAdmin,
  });
  const missing = query.data?.missing ?? [];
  if (!isAdmin || missing.length === 0) return null;
  return (
    <Link
      href="/dashboard/compliance/ai-act"
      role="status"
      className="group flex items-center gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3 focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
    >
      <AlertTriangle size={18} className="shrink-0 text-[color:var(--ds-warning-text)]" />
      <p className="min-w-0 flex-1 text-sm text-[color:var(--ds-warning-text)]">
        {missing.length === 1
          ? "1 Person nutzt KI ohne Schulungsnachweis (Art. 4 KI-VO)."
          : `${missing.length} Personen nutzen KI ohne Schulungsnachweis (Art. 4 KI-VO).`}{" "}
        Nachweis erfassen
      </p>
      <ArrowRight size={14} className="shrink-0 text-[color:var(--ds-warning-text)]" aria-hidden />
    </Link>
  );
}
