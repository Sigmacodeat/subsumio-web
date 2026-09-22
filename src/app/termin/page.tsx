"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Scale,
} from "lucide-react";

/**
 * Öffentliche Terminbuchung (WP-3.15) — kein Login, keine Kanzlei-Chrome.
 * Derselbe eigenständige Root-Pfad wie /erstanfrage und /portal/[token].
 * Slots kommen von GET /api/booking/public (serverseitig gegen belegte
 * Termine geprüft); die Buchung wird in POST /api/booking/public erneut
 * verifiziert — ein parallel vergezogener Slot scheitert dort mit 409.
 */

interface Slot {
  start: string;
  end: string;
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function TerminBuchungsPage() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateInput(d);
  });
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [legalArea, setLegalArea] = useState("");
  const [matter, setMatter] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadSlots = useCallback(async (d: string) => {
    setSlots(null);
    setSlotsError(false);
    setPicked(null);
    try {
      const res = await fetch(`/api/booking/public?date=${encodeURIComponent(d)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setSlots(data.data?.slots ?? []);
    } catch {
      setSlotsError(true);
    }
  }, []);

  useEffect(() => {
    void loadSlots(date);
  }, [date, loadSlots]);

  function shiftDate(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    if (d < new Date(new Date().setHours(0, 0, 0, 0))) return;
    setDate(toDateInput(d));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!picked || !name.trim() || !matter.trim()) {
      setError("Bitte Termin, Name und Anliegen auswählen/ausfüllen.");
      return;
    }
    if (!consent) {
      setError("Bitte der Verarbeitung Ihrer Angaben zustimmen.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          start: picked.start,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          legalArea: legalArea.trim() || undefined,
          matter: matter.trim(),
          consent: true,
          website,
        }),
      });
      if (res.status === 409) {
        setError("Dieser Termin wurde soeben vergeben. Bitte wählen Sie einen anderen.");
        void loadSlots(date);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Die Buchung konnte nicht übermittelt werden.");
        return;
      }
      setDone(true);
    } catch {
      setError(
        "Die Buchung konnte nicht übermittelt werden. Bitte versuchen Sie es später erneut."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 size={40} className="text-[color:var(--ds-success-text)]" />
        <h1 className="text-xl font-semibold">Termin gebucht</h1>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Ihr Termin am {dateLabel} um {picked ? formatTime(picked.start) : ""} Uhr ist vorgemerkt.
          Die Kanzlei bestätigt ihn zeitnah.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg space-y-6 p-6">
      <div className="space-y-2 pt-8 text-center">
        <Scale size={28} className="mx-auto text-[color:var(--brand-primary)]" />
        <h1 className="text-xl font-semibold">Termin buchen</h1>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Wählen Sie einen freien Termin und teilen Sie uns kurz Ihr Anliegen mit.
        </p>
      </div>

      {/* Tag wählen */}
      <div className="flex items-center justify-between rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
        <button
          type="button"
          onClick={() => shiftDate(-1)}
          aria-label="Vorheriger Tag"
          className="rounded-lg p-2 hover:bg-[color:var(--ds-surface-2)]"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <input
            type="date"
            aria-label="Datum wählen"
            value={date}
            min={toDateInput(new Date())}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-sm"
          />
          <p className="mt-1 text-xs text-[color:var(--ds-text-muted)] capitalize">{dateLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftDate(1)}
          aria-label="Nächster Tag"
          className="rounded-lg p-2 hover:bg-[color:var(--ds-surface-2)]"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Slots */}
      <section aria-label="Freie Termine" aria-live="polite">
        {slotsError ? (
          <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
            Termine konnten nicht geladen werden. Bitte später erneut versuchen.
          </p>
        ) : slots === null ? (
          <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
            <Loader2 size={13} className="animate-spin" /> Freie Termine werden geladen…
          </p>
        ) : slots.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
            <CalendarCheck size={13} aria-hidden /> An diesem Tag ist kein Termin mehr frei.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => setPicked(s)}
                aria-pressed={picked?.start === s.start}
                className={`rounded-lg border px-2 py-2 text-sm tabular-nums transition-colors ${
                  picked?.start === s.start
                    ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                    : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] hover:border-[color:var(--brand-primary)]"
                }`}
              >
                {formatTime(s.start)}
              </button>
            ))}
          </div>
        )}
      </section>

      <form onSubmit={submit} className="space-y-4">
        {/* Honeypot — für Menschen unsichtbar, Bots füllen jedes Feld aus. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="absolute h-0 w-0 opacity-0"
          aria-hidden="true"
        />

        <div className="space-y-1.5">
          <label htmlFor="tb-name" className="text-xs font-medium text-[color:var(--ds-text)]">
            Name *
          </label>
          <input
            id="tb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="tb-email" className="text-xs font-medium text-[color:var(--ds-text)]">
              E-Mail
            </label>
            <input
              id="tb-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="tb-phone" className="text-xs font-medium text-[color:var(--ds-text)]">
              Telefon
            </label>
            <input
              id="tb-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tb-area" className="text-xs font-medium text-[color:var(--ds-text)]">
            Rechtsgebiet (falls bekannt)
          </label>
          <input
            id="tb-area"
            value={legalArea}
            onChange={(e) => setLegalArea(e.target.value)}
            placeholder="z. B. Arbeitsrecht, Mietrecht"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="tb-matter" className="text-xs font-medium text-[color:var(--ds-text)]">
            Ihr Anliegen *
          </label>
          <textarea
            id="tb-matter"
            value={matter}
            onChange={(e) => setMatter(e.target.value)}
            required
            rows={4}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-start gap-2 text-xs text-[color:var(--ds-text-muted)]">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          Ich stimme zu, dass meine Angaben zur Durchführung des Termins verarbeitet werden. Eine
          Kollisionsprüfung nach § 10 RAO erfolgt vor jeder weiteren Kontaktaufnahme.
        </label>

        {error && (
          <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !picked}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {picked ? `Termin um ${formatTime(picked.start)} Uhr buchen` : "Bitte Termin wählen"}
        </button>
      </form>
    </div>
  );
}
