"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Scale } from "lucide-react";

/**
 * Öffentliches Erstanfrage-Formular für die Kanzlei — kein Login, keine
 * Kanzlei-Chrome. Siehe api/intake/public/route.ts für die
 * Kollisionsprüfung und Aktenanlage-Vorbereitung dahinter. Ein
 * eigenständiger Root-Pfad, kein Unterpfad von /at (das ist Subsumios
 * eigene Marketing-Seite) — derselbe Aufbau wie /portal/[token], die
 * andere Mandanten-zu-Kanzlei-Fläche außerhalb des Dashboards.
 */
export default function ErstanfrageFormPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [legalArea, setLegalArea] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !message.trim()) {
      setError("Bitte Name und Anliegen ausfüllen.");
      return;
    }
    if (!consent) {
      setError("Bitte der Verarbeitung Ihrer Angaben zustimmen.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          legalArea: legalArea.trim() || undefined,
          message: message.trim(),
          consent: true,
          website,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Ihre Anfrage konnte nicht übermittelt werden.");
        return;
      }
      setDone(true);
    } catch {
      setError(
        "Ihre Anfrage konnte nicht übermittelt werden. Bitte versuchen Sie es später erneut."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 size={40} className="text-[color:var(--ds-success-text)]" />
        <h1 className="text-xl font-semibold">Anfrage übermittelt</h1>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Vielen Dank. Wir prüfen Ihre Anfrage und melden uns so rasch wie möglich bei Ihnen.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg space-y-6 p-6">
      <div className="space-y-2 pt-8 text-center">
        <Scale size={28} className="mx-auto text-[color:var(--brand-primary)]" />
        <h1 className="text-xl font-semibold">Erstanfrage</h1>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Schildern Sie uns kurz Ihr Anliegen. Wir prüfen es und melden uns bei Ihnen.
        </p>
      </div>

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
          <label htmlFor="ea-name" className="text-xs font-medium text-[color:var(--ds-text)]">
            Name *
          </label>
          <input
            id="ea-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="ea-email" className="text-xs font-medium text-[color:var(--ds-text)]">
              E-Mail
            </label>
            <input
              id="ea-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ea-phone" className="text-xs font-medium text-[color:var(--ds-text)]">
              Telefon
            </label>
            <input
              id="ea-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="ea-area" className="text-xs font-medium text-[color:var(--ds-text)]">
            Rechtsgebiet (falls bekannt)
          </label>
          <input
            id="ea-area"
            value={legalArea}
            onChange={(e) => setLegalArea(e.target.value)}
            placeholder="z. B. Arbeitsrecht, Mietrecht"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="ea-message" className="text-xs font-medium text-[color:var(--ds-text)]">
            Ihr Anliegen *
          </label>
          <textarea
            id="ea-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={6}
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
          Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage verarbeitet werden. Eine
          Kollisionsprüfung nach § 10 RAO erfolgt vor jeder weiteren Kontaktaufnahme.
        </label>

        {error && (
          <p role="alert" className="text-xs text-[color:var(--ds-danger-text)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Anfrage senden
        </button>
      </form>
    </div>
  );
}
