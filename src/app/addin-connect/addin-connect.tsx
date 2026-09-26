"use client";

/**
 * Runs inside the Office dialog opened by the Word/Outlook task pane
 * (`Office.context.ui.displayDialogAsync`). After an explicit confirmation it
 * issues a 24-hour add-in token from the signed-in session and returns it with
 * `messageParent`, restricted to this origin (the task pane's origin). The
 * token is never shown or kept on this page.
 *
 * Opened outside Office, the page issues nothing — there is no task pane to
 * receive the token.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { csrfFetch } from "@/lib/csrf";
import { ADDIN_CLIENT_LABELS, buildAddinDialogMessage, type AddinClient } from "@/lib/addin-dialog";

const OFFICE_JS_URL = "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";
/** How long to wait for Office.js before treating the page as "not in Office". */
const OFFICE_READY_TIMEOUT_MS = 10_000;

export interface OfficeDialogApi {
  onReady: (cb?: () => void) => Promise<unknown>;
  context?: {
    ui?: {
      messageParent?: (message: string, options?: { targetOrigin: string }) => void;
    };
  };
}

type OfficeWindow = Window & { Office?: OfficeDialogApi };

/** Loads Office.js once and resolves with the dialog API, or null outside Office. */
export function loadOfficeDialogApi(
  win: OfficeWindow = window,
  timeoutMs = OFFICE_READY_TIMEOUT_MS
): Promise<OfficeDialogApi | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (api: OfficeDialogApi | null) => {
      if (settled) return;
      settled = true;
      resolve(api);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const ready = () => {
      const office = win.Office;
      if (!office) {
        clearTimeout(timer);
        done(null);
        return;
      }
      void office.onReady().then(
        () => {
          clearTimeout(timer);
          done(typeof office.context?.ui?.messageParent === "function" ? office : null);
        },
        () => {
          clearTimeout(timer);
          done(null);
        }
      );
    };
    if (win.Office) {
      ready();
      return;
    }
    const script = win.document.createElement("script");
    script.src = OFFICE_JS_URL;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    win.document.head.appendChild(script);
  });
}

type State =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "ready" }
  | { kind: "issuing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function AddinConnect({
  client,
  loadOffice = loadOfficeDialogApi,
}: {
  client: AddinClient | null;
  loadOffice?: () => Promise<OfficeDialogApi | null>;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [office, setOffice] = useState<OfficeDialogApi | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOffice().then((api) => {
      if (cancelled) return;
      setOffice(api);
      setState(api ? { kind: "ready" } : { kind: "outside" });
    });
    return () => {
      cancelled = true;
    };
  }, [loadOffice]);

  async function connect() {
    const messageParent = office?.context?.ui?.messageParent;
    if (!client || !messageParent) return;
    setState({ kind: "issuing" });
    try {
      const res = await csrfFetch("/api/addin-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: unknown;
        expires_at?: unknown;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const message = buildAddinDialogMessage(client, data);
      // Only a task pane on this origin may receive the token.
      messageParent(message, { targetOrigin: window.location.origin });
      setState({ kind: "done" });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Zugang konnte nicht erstellt werden.",
      });
    }
  }

  const label = client ? ADDIN_CLIENT_LABELS[client] : null;

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-sm"
    >
      <h1 className="text-lg font-semibold">
        {label ? `Subsumio mit ${label} verbinden` : "Add-in verbinden"}
      </h1>

      {!client && (
        <p role="alert" className="flex items-start gap-2 text-[color:var(--ds-danger-text)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Unbekanntes Add-in. Bitte die Anmeldung aus Word oder Outlook neu starten.
        </p>
      )}

      {client && state.kind === "loading" && (
        <p className="flex items-center gap-2" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Verbindung zu Office wird hergestellt…
        </p>
      )}

      {client && state.kind === "outside" && (
        <p role="alert">
          Diese Seite wird vom Word- oder Outlook-Add-in geöffnet. Bitte dort auf „Anmelden“
          klicken. Außerhalb von Office wird kein Zugang erstellt.
        </p>
      )}

      {client && (state.kind === "ready" || state.kind === "issuing") && (
        <>
          <p>
            Das {label}-Add-in erhält einen Zugang, der 24 Stunden gilt, nur Lesen und Schreiben
            erlaubt und jederzeit unter Einstellungen widerrufen werden kann.
          </p>
          <p className="text-xs opacity-80">
            Nur bestätigen, wenn Sie die Anmeldung soeben selbst in {label} gestartet haben.
          </p>
          <Button onClick={() => void connect()} disabled={state.kind === "issuing"}>
            {state.kind === "issuing" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {label} verbinden
          </Button>
        </>
      )}

      {state.kind === "done" && (
        <p className="flex items-center gap-2" aria-live="polite">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Verbunden. Dieses Fenster schließt sich automatisch.
        </p>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-[color:var(--ds-danger-text)]">
          {state.message}
        </p>
      )}
    </main>
  );
}
