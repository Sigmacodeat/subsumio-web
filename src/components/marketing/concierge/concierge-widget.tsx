"use client";

// Website concierge (docs/blueprints/VERTRIEBS-AGENT.md, Phase 1).
// Answers questions about Subsumio from the website's own content, shows the
// source of every statement, and hands over to a person through a contact
// form the visitor fills in and submits themselves. It never books, buys or
// signs anything on its own.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, ExternalLink, MessageCircle, UserRound, X } from "lucide-react";

interface Source {
  id: string;
  title: string;
  url: string;
}

type NextStep = "offer_contact" | "offer_meeting" | "offer_trial" | "show_pricing" | null;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  nextStep?: NextStep;
  suggestions?: string[];
  redacted?: string[];
}

type ConciergeEvent =
  | { type: "sentence"; sentence: { text: string; sources: Source[] } }
  | {
      type: "final";
      replace: boolean;
      reply: {
        sentences: Array<{ text: string; sources: Source[] }>;
        nextStep: NextStep;
        suggestions: string[];
        redacted: string[];
        profile: Record<string, string>;
      };
    }
  | { type: "unavailable" };

interface StoredState {
  sessionId: string;
  messages: ChatMessage[];
  profile: Record<string, string>;
}

const STORAGE_KEY = "sb_concierge_v1";
const HIDDEN_ON = ["/at/login", "/at/signup", "/at/reset", "/at/forgot", "/at/join"];

const GREETING =
  "Grüß Gott! Ich bin der KI-Assistent von Subsumio. Ich beantworte Fragen zu Funktionen, Preisen, Datenschutz und Einrichtung – jeweils mit Quelle auf unserer Website. Rechtsberatung gebe ich nicht.";

function startersFor(pathname: string): string[] {
  if (pathname.startsWith("/at/pricing"))
    return [
      "Welcher Tarif passt für eine Kanzlei mit 3 Anwälten?",
      "Wie funktioniert die Testphase?",
      "Was kostet zusätzliche KI-Nutzung?",
    ];
  if (pathname.startsWith("/at/security") || pathname.startsWith("/at/dpa"))
    return [
      "Wo liegen meine Daten?",
      "Wird mit meinen Akten ein Modell trainiert?",
      "Wie passt das zur Verschwiegenheitspflicht?",
    ];
  if (pathname.startsWith("/at/docs"))
    return [
      "Wie lege ich eine Frist an?",
      "Wie importiere ich bestehende Akten?",
      "Wie funktioniert die Kollisionsprüfung?",
    ];
  return [
    "Was unterscheidet Subsumio von ChatGPT?",
    "Was kostet Subsumio?",
    "Wo liegen meine Daten?",
  ];
}

function loadState(): StoredState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredState) : null;
  } catch {
    return null;
  }
}

function saveState(state: StoredState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / storage blocked: the chat still works for this page view.
  }
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16)
  );
}

export default function ConciergeWidget() {
  const pathname = usePathname() ?? "/at";
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<StoredState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [contactKind, setContactKind] = useState<"callback" | "meeting" | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  // On a phone the launcher sits right where the hero's own call to action is,
  // and the consent banner covers it on a first visit. It therefore appears
  // only once the reader has scrolled past the hero — the same rule the
  // back-to-top button follows. On wider screens it is there from the start.
  const [launcherVisible, setLauncherVisible] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const NARROW = "(max-width: 639px)";
    const update = () => {
      const narrow = window.matchMedia(NARROW).matches;
      setLauncherVisible(!narrow || window.scrollY > 600);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    setState(loadState() ?? { sessionId: newSessionId(), messages: [], profile: {} });
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  // Focus follows the dialog: into the input on open, back to the launcher on
  // close (the launcher only exists again after the re-render, hence the effect).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [state?.messages.length, busy, contactKind]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !state) return;
    const messages: ChatMessage[] = [...state.messages, { role: "user", content }];
    setState({ ...state, messages });
    setInput("");
    setBusy(true);

    const fail = (message: string, nextStep: NextStep = "offer_contact") =>
      appendAssistant(messages, { role: "assistant", content: message, nextStep });

    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          page: pathname,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.status === 429) {
        fail(
          "Sie haben gerade sehr viele Fragen gestellt. Bitte versuchen Sie es in einer Stunde wieder – oder lassen Sie sich direkt von uns zurückrufen."
        );
        return;
      }
      if (!res.ok || !res.body) {
        setUnavailable(true);
        fail(
          "Ich bin gerade nicht erreichbar. Hinterlassen Sie uns gern Ihre Frage – ein Mensch aus unserem Team antwortet Ihnen."
        );
        return;
      }

      // The answer arrives sentence by sentence, each already checked against
      // its source on the server; nothing unverified is ever shown.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let shown: Array<{ text: string; sources: Source[] }> = [];
      let closed = false;

      const render = (
        sentences: Array<{ text: string; sources: Source[] }>,
        extra: Partial<ChatMessage> = {}
      ) => {
        const sources = [
          ...new Map(sentences.flatMap((x) => x.sources).map((x) => [x.url, x])).values(),
        ];
        appendAssistant(messages, {
          role: "assistant",
          content: sentences.map((x) => x.text).join(" "),
          sources,
          ...extra,
        });
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          let event: ConciergeEvent;
          try {
            event = JSON.parse(payload) as ConciergeEvent;
          } catch {
            continue;
          }
          if (event.type === "sentence") {
            shown = [...shown, event.sentence];
            render(shown);
          } else if (event.type === "final") {
            closed = true;
            // The final reply is authoritative: it holds every checked
            // sentence, including the last one, which is never streamed (it
            // can still grow while the model writes).
            render(event.reply.sentences, {
              nextStep: event.reply.nextStep,
              suggestions: event.reply.suggestions,
              redacted: event.reply.redacted,
            });
            setState((prev) =>
              prev ? { ...prev, profile: { ...prev.profile, ...event.reply.profile } } : prev
            );
          } else if (event.type === "unavailable") {
            closed = true;
            setUnavailable(true);
            fail(
              "Ich bin gerade nicht erreichbar. Hinterlassen Sie uns gern Ihre Frage – ein Mensch aus unserem Team antwortet Ihnen."
            );
          }
        }
      }
      if (!closed && shown.length === 0) {
        setUnavailable(true);
        fail(
          "Ich bin gerade nicht erreichbar. Hinterlassen Sie uns gern Ihre Frage – ein Mensch aus unserem Team antwortet Ihnen."
        );
      }
    } catch {
      fail("Die Verbindung ist abgebrochen. Bitte versuchen Sie es noch einmal.", null);
    } finally {
      setBusy(false);
    }
  }

  function appendAssistant(
    base: ChatMessage[],
    message: ChatMessage,
    profile?: Record<string, string>
  ) {
    setState((prev) =>
      prev
        ? {
            ...prev,
            messages: [...base, message],
            profile: { ...prev.profile, ...(profile ?? {}) },
          }
        : prev
    );
  }

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const messages = state?.messages ?? [];
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <>
      {!open && launcherVisible && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="fixed right-4 bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] z-50 flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white shadow-lg shadow-black/25 transition-transform [background:var(--brand-primary)] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none sm:right-8 sm:bottom-24"
        >
          <MessageCircle size={18} aria-hidden="true" />
          Fragen zu Subsumio?
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[min(640px,100dvh)] flex-col border [border-color:var(--mk-border)] shadow-2xl shadow-black/30 [background:var(--mk-surface)] sm:inset-x-auto sm:right-8 sm:bottom-8 sm:h-[min(640px,calc(100dvh-4rem))] sm:w-[400px] sm:rounded-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b [border-color:var(--mk-border)] px-4 py-3">
            <div>
              <h2 id={titleId} className="text-sm font-semibold [color:var(--mk-text)]">
                Subsumio-Assistent
              </h2>
              <p className="text-xs [color:var(--mk-text-subtle)]">
                KI-Assistent · antwortet mit Quellen · keine Rechtsberatung
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setContactKind("callback")}
                className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs [color:var(--mk-text-subtle)] hover:[color:var(--mk-text)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none"
              >
                <UserRound size={14} aria-hidden="true" /> Mensch
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Chat schließen"
                className="flex h-9 w-9 items-center justify-center rounded-lg [color:var(--mk-text-subtle)] hover:[color:var(--mk-text)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            aria-live="polite"
            aria-busy={busy}
          >
            <Bubble role="assistant">{GREETING}</Bubble>
            {messages.length === 0 && (
              <Suggestions items={startersFor(pathname)} onPick={(q) => void send(q)} />
            )}
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <Bubble role={m.role}>{m.content}</Bubble>
                {m.redacted && m.redacted.length > 0 && (
                  <p className="text-xs [color:var(--mk-text-subtle)]">
                    Aus Ihrer Nachricht entfernt: {m.redacted.join(", ")}. Bitte geben Sie hier
                    keine Mandanten- oder Kontaktdaten ein.
                  </p>
                )}
                {m.sources && m.sources.length > 0 && <SourceList sources={m.sources} />}
                {m === lastAssistant && !busy && (
                  <NextStepCard
                    step={m.nextStep ?? null}
                    onContact={(kind) => setContactKind(kind)}
                  />
                )}
                {m === lastAssistant && !busy && m.suggestions && m.suggestions.length > 0 && (
                  <Suggestions items={m.suggestions} onPick={(q) => void send(q)} />
                )}
              </div>
            ))}
            {busy && (
              <p className="text-xs [color:var(--mk-text-subtle)]" role="status">
                Suche in unseren Inhalten …
              </p>
            )}
            {contactKind && state && (
              <ContactForm
                kind={contactKind}
                sessionId={state.sessionId}
                page={pathname}
                profile={state.profile}
                onDone={() => setContactKind(null)}
              />
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="border-t [border-color:var(--mk-border)] px-3 py-3"
          >
            <label htmlFor={`${titleId}-input`} className="sr-only">
              Ihre Frage
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id={`${titleId}-input`}
                ref={inputRef}
                value={input}
                maxLength={2000}
                rows={1}
                disabled={unavailable}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={unavailable ? "Assistent nicht erreichbar" : "Ihre Frage zu Subsumio"}
                className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border [border-color:var(--mk-control-border)] px-3 py-2 text-sm [color:var(--mk-text)] [background:var(--mk-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none"
              />
              <button
                type="submit"
                disabled={busy || !input.trim() || unavailable}
                aria-label="Senden"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white [background:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none disabled:opacity-40"
              >
                <ArrowUp size={18} />
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug [color:var(--mk-text-subtle)]">
              Bitte keine Mandantendaten eingeben. Der Chat wird zur Verbesserung ohne IP-Adresse
              gespeichert.{" "}
              <Link href="/at/privacy" className="underline underline-offset-2">
                Datenschutz
              </Link>
            </p>
          </form>
        </div>
      )}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <p
        className={
          mine
            ? "max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm whitespace-pre-line text-white [background:var(--brand-primary)]"
            : "max-w-[90%] rounded-2xl rounded-bl-md px-3 py-2 text-sm whitespace-pre-line [color:var(--mk-text)] [background:var(--mk-surface-2)]"
        }
      >
        <span className="sr-only">{mine ? "Sie: " : "Assistent: "}</span>
        {children}
      </p>
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Quellen">
      {sources.slice(0, 4).map((s) => (
        <Link
          key={s.url}
          href={s.url}
          className="inline-flex items-center gap-1 rounded-full border [border-color:var(--mk-border)] px-2 py-0.5 text-[11px] [color:var(--mk-text-subtle)] hover:[color:var(--mk-text)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none"
        >
          <ExternalLink size={10} aria-hidden="true" />
          {s.title}
        </Link>
      ))}
    </div>
  );
}

function Suggestions({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="rounded-full border [border-color:var(--mk-control-border)] px-3 py-1 text-left text-xs [color:var(--mk-text)] hover:[border-color:var(--mk-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function NextStepCard({
  step,
  onContact,
}: {
  step: NextStep;
  onContact: (kind: "callback" | "meeting") => void;
}) {
  const btn =
    "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none";
  if (step === "offer_trial")
    return (
      <Link href="/at/signup" className={`${btn} text-white [background:var(--brand-primary)]`}>
        Kostenlos testen
      </Link>
    );
  if (step === "show_pricing")
    return (
      <Link
        href="/at/pricing"
        className={`${btn} border [border-color:var(--mk-control-border)] [color:var(--mk-text)]`}
      >
        Preise ansehen
      </Link>
    );
  if (step === "offer_contact" || step === "offer_meeting")
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onContact(step === "offer_meeting" ? "meeting" : "callback")}
          className={`${btn} text-white [background:var(--brand-primary)]`}
        >
          {step === "offer_meeting" ? "Termin anfragen" : "Rückruf anfragen"}
        </button>
      </div>
    );
  return null;
}

function ContactForm({
  kind,
  sessionId,
  page,
  profile,
  onDone,
}: {
  kind: "callback" | "meeting";
  sessionId: string;
  page: string;
  profile: Record<string, string>;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error" | "limited">("idle");
  const formId = useId();
  const field =
    "w-full rounded-lg border px-3 py-2 text-sm [border-color:var(--mk-control-border)] [color:var(--mk-text)] [background:var(--mk-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none";

  if (status === "sent")
    return (
      <div
        role="status"
        className="rounded-xl border [border-color:var(--mk-border)] p-3 text-sm [color:var(--mk-text)]"
      >
        Danke! Ihre Anfrage ist bei uns. Wir melden uns in der Regel am nächsten Werktag.
      </div>
    );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v || undefined;
    };
    setStatus("sending");
    const res = await fetch("/api/concierge/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        name: get("name"),
        email: get("email"),
        firm: get("firm"),
        phone: get("phone"),
        firmSize: get("firmSize"),
        preferredTime: get("preferredTime"),
        message: get("message"),
        website: get("website"),
        consent: f.get("consent") === "on",
        sessionId,
        page,
        profile,
      }),
    }).catch(() => null);
    if (res?.ok) setStatus("sent");
    else setStatus(res?.status === 429 ? "limited" : "error");
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-labelledby={`${formId}-title`}
      className="space-y-2 rounded-xl border [border-color:var(--mk-border)] p-3"
    >
      <div className="flex items-center justify-between">
        <h3 id={`${formId}-title`} className="text-sm font-semibold [color:var(--mk-text)]">
          {kind === "meeting" ? "Termin anfragen" : "Rückruf anfragen"}
        </h3>
        <button
          type="button"
          onClick={onDone}
          className="text-xs [color:var(--mk-text-subtle)] underline underline-offset-2"
        >
          Abbrechen
        </button>
      </div>
      <input
        name="name"
        required
        maxLength={120}
        placeholder="Name *"
        aria-label="Name"
        className={field}
      />
      <input
        name="email"
        type="email"
        required
        maxLength={200}
        placeholder="E-Mail *"
        aria-label="E-Mail"
        className={field}
      />
      <input
        name="firm"
        maxLength={200}
        placeholder="Kanzlei"
        aria-label="Kanzlei"
        className={field}
      />
      <input
        name="phone"
        type="tel"
        maxLength={40}
        placeholder="Telefon"
        aria-label="Telefon"
        className={field}
      />
      <select name="firmSize" aria-label="Kanzleigröße" className={field} defaultValue="">
        <option value="">Kanzleigröße (optional)</option>
        <option>Allein</option>
        <option>2–5 Personen</option>
        <option>6–20 Personen</option>
        <option>Mehr als 20 Personen</option>
      </select>
      {kind === "meeting" && (
        <input
          name="preferredTime"
          maxLength={200}
          placeholder="Wann passt es Ihnen? (z. B. Di oder Do vormittags)"
          aria-label="Wunschtermin"
          className={field}
        />
      )}
      <textarea
        name="message"
        maxLength={2000}
        rows={2}
        placeholder="Worum geht es? (optional)"
        aria-label="Nachricht"
        className={field}
      />
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0"
      />
      <label className="flex items-start gap-2 text-xs [color:var(--mk-text-subtle)]">
        <input name="consent" type="checkbox" required className="mt-0.5" />
        <span>
          Ich möchte zu dieser Anfrage kontaktiert werden. Den bisherigen Chat (ohne
          personenbezogene Daten) erhält das Team dazu.{" "}
          <Link href="/at/privacy" className="underline underline-offset-2">
            Datenschutz
          </Link>
        </span>
      </label>
      {status === "error" && (
        <p role="alert" className="text-xs [color:var(--ds-danger-text)]">
          Das hat nicht geklappt. Bitte schreiben Sie uns an hello@subsum.io.
        </p>
      )}
      {status === "limited" && (
        <p role="alert" className="text-xs [color:var(--ds-danger-text)]">
          Zu viele Anfragen in kurzer Zeit. Bitte schreiben Sie uns an hello@subsum.io.
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white [background:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--mk-focus-ring)] focus-visible:outline-none disabled:opacity-50"
      >
        {status === "sending" ? "Wird gesendet …" : "Anfrage senden"}
      </button>
    </form>
  );
}
