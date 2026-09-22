"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CalendarCheck, CheckCircle2, Loader2, Scale, Send, User } from "lucide-react";

/**
 * Öffentlicher Mandatsannahme-Agent (WP-5.28) — geführtes Chat-Onboarding
 * statt Formular. Bewusst ohne LLM auf der öffentlichen Fläche: ein
 * deterministischer Dialogbaum kann nicht prompt-injiziert werden und
 * kostet keine Credits. Ablauf: Rechtsgebiet → Name → Gegenseite
 * (Kollisionsprüfung § 10 RAO, serverseitig in /api/intake/public) →
 * Kontakt → Anliegen → DSGVO-Consent → Übermittlung → optional direkte
 * Terminbuchung über /api/booking/public.
 */

interface Slot {
  start: string;
  end: string;
}

interface Msg {
  role: "bot" | "user";
  text: string;
}

type Step =
  | "legalArea"
  | "name"
  | "opponent"
  | "contact"
  | "message"
  | "consent"
  | "submitting"
  | "bookingOffer"
  | "bookingSlot"
  | "done";

const LEGAL_AREAS = [
  "Schadenersatz",
  "Arbeitsrecht",
  "Familienrecht",
  "Strafrecht",
  "Vertragsrecht",
  "Immobilienrecht",
  "Unternehmensrecht",
  "Sonstiges",
];

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function MandatAgentPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "bot",
      text: "Guten Tag — ich bin der digitale Assistent der Kanzlei und begleite Sie durch die Erstanfrage. Worum geht es rechtlich?",
    },
  ]);
  const [step, setStep] = useState<Step>("legalArea");
  const [legalArea, setLegalArea] = useState("");
  const [name, setName] = useState("");
  const [opponent, setOpponent] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [matter, setMatter] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<"idle" | "checking" | "offered" | "unavailable">("idle");
  const [slotDate, setSlotDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookedLabel, setBookedLabel] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, step]);

  function push(role: Msg["role"], text: string) {
    setMessages((m) => [...m, { role, text }]);
  }

  function nextTextStep(botQuestion: string, next: Step) {
    push("bot", botQuestion);
    setStep(next);
    setInput("");
  }

  async function handleSubmitIntake() {
    setError(null);
    setStep("submitting");
    push("user", "Anfrage absenden");
    try {
      const res = await fetch("/api/intake/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          legalArea: legalArea || undefined,
          opponent: opponent.trim() || undefined,
          message: matter.trim(),
          consent: true,
          website,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.message ||
            "Die Anfrage konnte nicht übermittelt werden. Bitte später erneut versuchen."
        );
      }
      push(
        "bot",
        "Danke! Ihre Anfrage ist bei der Kanzlei eingegangen und wird zeitnah geprüft. Möchten Sie direkt einen Erstgespräch-Termin buchen?"
      );
      setStep("bookingOffer");
      void offerBooking();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      push("bot", "Das hat leider nicht geklappt — bitte versuchen Sie es erneut.");
      setStep("consent");
    }
  }

  async function offerBooking() {
    setBooking("checking");
    // Finde den nächsten Tag mit freien Slots (max. 10 Werktage voraus).
    for (let i = 1; i <= 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const iso = toDateInput(d);
      try {
        const res = await fetch(`/api/booking/public?date=${iso}`);
        if (!res.ok) continue;
        const data = await res.json();
        const free: Slot[] = data.data?.slots ?? [];
        if (free.length > 0) {
          setSlotDate(iso);
          setSlots(free);
          setBooking("offered");
          return;
        }
      } catch {
        continue;
      }
    }
    setBooking("unavailable");
  }

  async function bookSlot(slot: Slot) {
    setBookingBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: slotDate,
          start: slot.start,
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          legalArea: legalArea || undefined,
          matter: matter.trim(),
          consent: true,
          website,
        }),
      });
      if (res.status === 409) {
        setError("Dieser Termin wurde soeben vergeben — bitte einen anderen wählen.");
        await offerBooking();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Die Buchung konnte nicht übermittelt werden.");
      }
      const label = `${new Date(`${slotDate}T00:00:00`).toLocaleDateString("de-AT", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      })}, ${new Date(slot.start).toLocaleTimeString("de-AT", {
        hour: "2-digit",
        minute: "2-digit",
      })} Uhr`;
      setBookedLabel(label);
      push(
        "bot",
        `Ihr Erstgespräch ist vorgemerkt: ${label}. Die Kanzlei bestätigt den Termin zeitnah.`
      );
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBookingBusy(false);
    }
  }

  function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = input.trim();
    if (step === "name") {
      if (!v) {
        setError("Bitte geben Sie Ihren Namen an.");
        return;
      }
      setName(v);
      push("user", v);
      nextTextStep(
        "Danke. Wie heißt die Gegenseite (Person oder Firma)? Das ist wichtig für die vorgeschriebene Kollisionsprüfung — Sie können auch „unbekannt“ schreiben.",
        "opponent"
      );
    } else if (step === "opponent") {
      setOpponent(v);
      push("user", v || "unbekannt");
      push(
        "bot",
        "Wie können wir Sie erreichen? Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an."
      );
      setStep("contact");
      setInput("");
    } else if (step === "message") {
      if (v.length < 10) {
        setError("Bitte beschreiben Sie Ihr Anliegen mit mindestens ein paar Sätzen.");
        return;
      }
      setMatter(v);
      push("user", v);
      push(
        "bot",
        "Fast fertig — bitte stimmen Sie der Verarbeitung Ihrer Angaben zur Bearbeitung dieser Anfrage zu (DSGVO)."
      );
      setStep("consent");
      setInput("");
    }
  }

  function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() && !phone.trim()) {
      setError("Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Bitte prüfen Sie die E-Mail-Adresse.");
      return;
    }
    push("user", [email.trim(), phone.trim()].filter(Boolean).join(" · "));
    nextTextStep(
      "Beschreiben Sie kurz Ihr Anliegen — ein paar Sätze genügen. Bitte keine sensiblen Details (z.B. Kontonummern) hier eingeben.",
      "message"
    );
  }

  const inputCls =
    "w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1";

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col p-4 sm:p-6">
      <div className="space-y-2 pt-6 pb-4 text-center">
        <Scale size={26} className="mx-auto text-[color:var(--brand-primary)]" />
        <h1 className="text-lg font-semibold">Erstanfrage-Assistent</h1>
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Ein paar Fragen — dann landet Ihre Anfrage direkt bei der Kanzlei.
        </p>
      </div>

      {/* Chat-Verlauf */}
      <div
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
        aria-live="polite"
        aria-label="Gesprächsverlauf"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "bot" && (
              <span className="brand-soft brand-border mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border">
                <Bot size={12} className="brand-text" />
              </span>
            )}
            <p
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "brand-bg text-white"
                  : "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
              }`}
            >
              {m.text}
            </p>
            {m.role === "user" && (
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--ds-border)]">
                <User size={12} className="text-[color:var(--ds-text-muted)]" />
              </span>
            )}
          </div>
        ))}
        {step === "submitting" && (
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
            <Loader2 size={12} className="animate-spin" /> Anfrage wird übermittelt…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]"
        >
          {error}
        </p>
      )}

      {/* Schritt-Eingaben */}
      <div className="pt-3">
        {step === "legalArea" && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Rechtsgebiet wählen">
            {LEGAL_AREAS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setLegalArea(a);
                  push("user", a);
                  nextTextStep("Verstanden. Wie ist Ihr vollständiger Name?", "name");
                }}
                className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text)] transition-colors hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)]"
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {(step === "name" || step === "opponent" || step === "message") && (
          <form onSubmit={handleTextSubmit} className="flex gap-2">
            {step === "message" ? (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                autoFocus
                aria-label="Ihr Anliegen"
                className={inputCls}
                placeholder="Ihr Anliegen…"
              />
            ) : (
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                aria-label={step === "name" ? "Ihr Name" : "Gegenseite"}
                className={inputCls}
                placeholder={
                  step === "name" ? "Vor- und Nachname" : "Name der Gegenseite oder „unbekannt“"
                }
              />
            )}
            <button
              type="submit"
              className="brand-bg flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-lg text-white"
              aria-label="Senden"
            >
              <Send size={14} />
            </button>
          </form>
        )}

        {step === "contact" && (
          <form onSubmit={handleContactSubmit} className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              aria-label="E-Mail-Adresse"
              className={inputCls}
              placeholder="E-Mail-Adresse"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="Telefonnummer"
              className={inputCls}
              placeholder="Telefonnummer (alternativ)"
            />
            {/* Honeypot */}
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />
            <button
              type="submit"
              className="brand-bg w-full rounded-lg py-2 text-sm font-medium text-white"
            >
              Weiter
            </button>
          </form>
        )}

        {step === "consent" && (
          <div className="space-y-2">
            <label className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-xs text-[color:var(--ds-text-muted)]">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              Ich stimme zu, dass die Kanzlei meine Angaben zur Prüfung und Beantwortung dieser
              Anfrage verarbeitet (inkl. Kollisionsprüfung gegen bestehende Mandate).
            </label>
            <button
              type="button"
              disabled={!consent}
              onClick={handleSubmitIntake}
              className="brand-bg w-full rounded-lg py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Anfrage absenden
            </button>
          </div>
        )}

        {step === "bookingOffer" && (
          <div className="space-y-2">
            {booking === "checking" && (
              <p className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                <Loader2 size={12} className="animate-spin" /> Freie Termine werden gesucht…
              </p>
            )}
            {booking === "offered" && (
              <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text)]">
                  <CalendarCheck size={13} className="text-[color:var(--brand-primary)]" />
                  {new Date(`${slotDate}T00:00:00`).toLocaleDateString("de-AT", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {slots.slice(0, 9).map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      disabled={bookingBusy}
                      onClick={() => bookSlot(s)}
                      className="rounded-md border border-[color:var(--ds-border)] py-1.5 text-xs text-[color:var(--ds-text)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)] disabled:opacity-50"
                    >
                      {new Date(s.start).toLocaleTimeString("de-AT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setStep("done")}
                  className="mt-2 w-full text-xs text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
                >
                  Kein Termin nötig
                </button>
              </div>
            )}
            {booking === "unavailable" && (
              <button
                type="button"
                onClick={() => setStep("done")}
                className="brand-bg w-full rounded-lg py-2 text-sm font-medium text-white"
              >
                Fertig — die Kanzlei meldet sich
              </button>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] p-3 text-xs text-[color:var(--ds-success-text)]">
            <CheckCircle2 size={14} />
            {bookedLabel
              ? `Alles erledigt — Termin ${bookedLabel}.`
              : "Alles erledigt — die Kanzlei meldet sich bei Ihnen."}
          </div>
        )}
      </div>
    </div>
  );
}
