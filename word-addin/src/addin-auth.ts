/**
 * Sign-in of the Office add-ins through the Office dialog.
 *
 * The task pane opens `<apiBase>/addin-connect?client=<word|outlook>` with
 * `Office.context.ui.displayDialogAsync`. There the person signs in normally
 * (incl. 2FA) and confirms; the page issues a short-lived add-in token and
 * returns it with `messageParent`. This module checks where the message comes
 * from and what it contains, and keeps the token only in memory plus
 * sessionStorage of this task pane (gone when Office closes) — never in
 * localStorage, which belongs to the whole app origin and survives restarts.
 *
 * Identical copies live in word-addin/src and outlook-addin/src (separate
 * builds); src/lib/addin-auth.test.ts keeps them in step and mirrors the
 * dialog contract of src/lib/addin-dialog.ts.
 */

export const ADDIN_DIALOG_MESSAGE_TYPE = "subsumio-addin-token";
export const ADDIN_TOKEN_PREFIX = "sk_addin_";
export const SESSION_STORAGE_KEY = "subsumio_addin_session";
/** Older versions kept a permanent API key here; removed on every start. */
export const LEGACY_STORAGE_KEY = "subsumio_api_key";
/** Ask for a new sign-in this long before the token expires. */
export const RENEW_LEAD_MS = 15 * 60 * 1000;

export interface AddinSession {
  token: string;
  /** Epoch milliseconds after which the token no longer authenticates. */
  expiresAt: number;
}

export interface DialogMessageArg {
  message?: unknown;
  /** Origin of the dialog page (DialogApi 1.2+). */
  origin?: unknown;
}

/**
 * Validates a message from the sign-in dialog. The origin must be the Subsumio
 * origin; hosts without DialogApi 1.2 report no origin, but there Office only
 * delivers messages from pages on the task pane's own domain.
 */
export function parseDialogMessage(
  arg: DialogMessageArg,
  expected: { origin: string; client: string; originRequired: boolean },
  now: number = Date.now()
): AddinSession {
  if (arg.origin !== undefined || expected.originRequired) {
    if (arg.origin !== expected.origin) {
      throw new Error("Anmeldung von unbekannter Herkunft abgelehnt.");
    }
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String(arg.message ?? "")) as Record<string, unknown>;
  } catch {
    throw new Error("Unerwartete Antwort der Anmeldung.");
  }
  if (!data || data.type !== ADDIN_DIALOG_MESSAGE_TYPE || data.client !== expected.client) {
    throw new Error("Unerwartete Antwort der Anmeldung.");
  }
  const token = data.token;
  if (typeof token !== "string" || !token.startsWith(ADDIN_TOKEN_PREFIX)) {
    throw new Error("Kein gültiger Add-in-Zugang erhalten.");
  }
  const expiresAt = Date.parse(String(data.expires_at ?? ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error("Der erhaltene Zugang ist bereits abgelaufen.");
  }
  return { token, expiresAt };
}

export function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** A stored, still valid session of this task pane (expired ones are dropped). */
export function readStoredSession(
  storage: Storage | null,
  now: number = Date.now()
): AddinSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AddinSession>;
    if (
      typeof s.token === "string" &&
      s.token.startsWith(ADDIN_TOKEN_PREFIX) &&
      typeof s.expiresAt === "number" &&
      s.expiresAt > now
    ) {
      return { token: s.token, expiresAt: s.expiresAt };
    }
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* unreadable — treat as signed out */
  }
  return null;
}

export function storeSession(storage: Storage | null, session: AddinSession): void {
  try {
    storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage blocked — the token stays in memory for this pane only */
  }
}

/** Removes the session and any permanent key an older version left behind. */
export function clearStoredSession(storage: Storage | null): void {
  try {
    storage?.removeItem(SESSION_STORAGE_KEY);
    storage?.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* nothing stored either */
  }
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
}

/** Milliseconds until the pane should ask for a new sign-in (0 = now). */
export function msUntilRenewal(
  session: AddinSession,
  now: number = Date.now(),
  lead: number = RENEW_LEAD_MS
): number {
  return Math.max(0, session.expiresAt - lead - now);
}

// ── Office dialog ────────────────────────────────────────────────────

interface DialogLike {
  addEventHandler(
    eventType: string,
    handler: (arg: DialogMessageArg & { error?: number }) => void
  ): void;
  close(): void;
}

interface AsyncResultLike {
  status: string;
  value: DialogLike;
  error?: { code?: number; message?: string };
}

/** The part of `Office` the sign-in needs (structural, so both builds can use it). */
export interface OfficeDialogHost {
  context: {
    ui: {
      displayDialogAsync(
        url: string,
        options: { height: number; width: number; displayInIframe?: boolean },
        callback: (result: AsyncResultLike) => void
      ): void;
    };
    requirements?: { isSetSupported(name: string, version?: string): boolean };
  };
}

function dialogErrorText(code: number | undefined): string {
  if (code === 12006) return "Anmeldung abgebrochen.";
  if (code === 12007) return "Das Anmeldefenster ist bereits geöffnet.";
  if (code === 12009) return "Das Anmeldefenster wurde blockiert. Bitte erneut versuchen.";
  if (code === 12002 || code === 12003) return "Die Anmeldeseite konnte nicht geladen werden.";
  return "Anmeldung fehlgeschlagen.";
}

/** Opens the sign-in dialog and resolves with the add-in session it returns. */
export function openSignInDialog(
  office: OfficeDialogHost,
  opts: { apiBase: string; client: "word" | "outlook" }
): Promise<AddinSession> {
  const origin = new URL(opts.apiBase).origin;
  const url = `${origin}/addin-connect?client=${encodeURIComponent(opts.client)}`;
  const originRequired = office.context.requirements?.isSetSupported("DialogApi", "1.2") ?? false;
  return new Promise((resolve, reject) => {
    office.context.ui.displayDialogAsync(
      url,
      { height: 70, width: 35, displayInIframe: false },
      (result) => {
        if (result.status !== "succeeded") {
          reject(new Error(dialogErrorText(result.error?.code)));
          return;
        }
        const dialog = result.value;
        let settled = false;
        dialog.addEventHandler("dialogMessageReceived", (arg) => {
          if (settled) return;
          settled = true;
          dialog.close();
          try {
            resolve(parseDialogMessage(arg, { origin, client: opts.client, originRequired }));
          } catch (e) {
            reject(e instanceof Error ? e : new Error("Anmeldung fehlgeschlagen."));
          }
        });
        dialog.addEventHandler("dialogEventReceived", (arg) => {
          if (settled) return;
          settled = true;
          reject(new Error(dialogErrorText(arg.error)));
        });
      }
    );
  });
}
