"use client";

// Receiving firm + Art. 13 DSGVO notice for the public forms (/erstanfrage,
// /termin, /mandat). The firm is the controller; the form is only offered
// when GET /api/intake/public names it (src/lib/public-firm.ts).

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Scale } from "lucide-react";

export interface PublicFirm {
  name: string;
  address: string;
  email: string;
  phone?: string;
  privacyUrl?: string;
}

type State =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; firm: PublicFirm };

export function usePublicFirm(form: "intake" | "booking"): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetch(`/api/intake/public?form=${form}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { data?: { firm?: PublicFirm } };
        if (!alive) return;
        const firm = res.ok ? data.data?.firm : undefined;
        setState(firm ? { status: "ready", firm } : { status: "unavailable" });
      })
      .catch(() => alive && setState({ status: "unavailable" }));
    return () => {
      alive = false;
    };
  }, [form]);
  return state;
}

/** Renders the form only when the receiving firm is known. */
export function PublicFirmGate({
  form,
  children,
}: {
  form: "intake" | "booking";
  children: (firm: PublicFirm) => ReactNode;
}) {
  const state = usePublicFirm(form);
  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <Loader2 size={20} className="animate-spin text-[color:var(--ds-text-muted)]" />
      </div>
    );
  }
  if (state.status === "unavailable") {
    return (
      <div
        className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 p-6 text-center"
        data-testid="public-form-unavailable"
      >
        <Scale size={28} className="text-[color:var(--brand-primary)]" />
        <h1 className="text-lg font-semibold">Dieses Formular ist derzeit nicht verfügbar</h1>
        <p className="text-sm text-[color:var(--ds-text-muted)]">
          Es ist keiner Kanzlei eindeutig zugeordnet. Bitte wenden Sie sich direkt per Telefon oder
          E-Mail an die Kanzlei, die Sie erreichen möchten.
        </p>
      </div>
    );
  }
  return <>{children(state.firm)}</>;
}

/** "Your details go to …" — shown at the top of each form. */
export function PublicFirmHeader({ firm }: { firm: PublicFirm }) {
  return (
    <p
      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
      data-testid="public-firm-header"
    >
      Ihre Angaben gehen an: <strong className="text-[color:var(--ds-text)]">{firm.name}</strong>,{" "}
      {firm.address} · {firm.email}
      {firm.phone ? ` · ${firm.phone}` : ""}
    </p>
  );
}

/** Consent sentence naming the firm (controller). */
export function consentText(firm: PublicFirm): string {
  return `Ich willige ein, dass ${firm.name} meine Angaben zur Prüfung und Beantwortung dieser Anfrage verarbeitet — einschließlich der Kollisionsprüfung gegen bestehende Mandate und, soweit ich solche angebe, besonderer Kategorien personenbezogener Daten (Art. 9 DSGVO). Die Einwilligung kann ich jederzeit widerrufen.`;
}

/** Information under Art. 13 DSGVO — the firm is the controller. */
export function PublicPrivacyNotice({
  firm,
  purpose,
}: {
  firm: PublicFirm;
  purpose: "intake" | "booking";
}) {
  const what =
    purpose === "booking"
      ? "die Vereinbarung und Vorbereitung des gewünschten Termins"
      : "die Prüfung und Beantwortung Ihrer Anfrage";
  return (
    <details
      className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-xs text-[color:var(--ds-text-muted)]"
      data-testid="public-privacy-notice"
    >
      <summary className="cursor-pointer font-medium text-[color:var(--ds-text)]">
        Datenschutzhinweis (Art. 13 DSGVO)
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          <strong>Verantwortlich:</strong> {firm.name}, {firm.address}, {firm.email}
          {firm.phone ? `, ${firm.phone}` : ""}.
        </p>
        <p>
          <strong>Zweck:</strong> {what}, einschließlich der berufsrechtlich vorgeschriebenen
          Prüfung auf Interessenkollision vor einer Mandatsübernahme.
        </p>
        <p>
          <strong>Rechtsgrundlage:</strong> Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, bei
          besonderen Kategorien personenbezogener Daten Art. 9 Abs. 2 lit. a DSGVO) sowie
          vorvertragliche Maßnahmen auf Ihre Anfrage (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <p>
          <strong>Empfänger:</strong> Die Kanzlei nutzt für dieses Formular die Software Subsumio
          als Auftragsverarbeiter; dessen Unterauftragsverarbeiter nennt die{" "}
          <a href="/at/privacy" target="_blank" rel="noreferrer" className="underline">
            Datenschutzerklärung von Subsumio
          </a>
          .
        </p>
        <p>
          <strong>Speicherdauer:</strong> Solange es für die Bearbeitung Ihrer Anfrage erforderlich
          ist; darüber hinaus nur, soweit gesetzliche oder berufsrechtliche Aufbewahrungspflichten
          bestehen.
        </p>
        <p>
          <strong>Ihre Rechte:</strong> Auskunft, Berichtigung, Löschung, Einschränkung der
          Verarbeitung, Datenübertragbarkeit und Widerspruch; Widerruf der Einwilligung jederzeit
          mit Wirkung für die Zukunft — jeweils an {firm.email}. Sie können sich bei einer
          Datenschutz-Aufsichtsbehörde beschweren (in Österreich: Datenschutzbehörde, dsb.gv.at).
        </p>
        <p>
          Die Angaben sind freiwillig; ohne Kontaktangabe kann die Kanzlei nicht antworten.
          {firm.privacyUrl ? (
            <>
              {" "}
              Weitere Informationen:{" "}
              <a href={firm.privacyUrl} target="_blank" rel="noreferrer" className="underline">
                Datenschutzerklärung der Kanzlei
              </a>
              .
            </>
          ) : null}
        </p>
      </div>
    </details>
  );
}
