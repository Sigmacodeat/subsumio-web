/**
 * Office add-in sign-in dialog — the contract between the dialog page
 * (/addin-connect) and the Word/Outlook task panes.
 *
 * The task pane opens `/addin-connect?client=<word|outlook>` with
 * `Office.context.ui.displayDialogAsync`. After normal sign-in (incl. 2FA) the
 * person confirms, the page issues a short-lived add-in token
 * (POST /api/addin-token) and returns it with `messageParent` as the JSON
 * message below. The task panes mirror this shape in their own addin-auth.ts
 * (the add-in builds cannot import from the web app).
 *
 * Client-safe: no server imports.
 */

export const ADDIN_CLIENTS = ["word", "outlook"] as const;
export type AddinClient = (typeof ADDIN_CLIENTS)[number];

export const ADDIN_CLIENT_LABELS: Record<AddinClient, string> = {
  word: "Word",
  outlook: "Outlook",
};

/** `type` of the message the dialog sends to the task pane. */
export const ADDIN_DIALOG_MESSAGE_TYPE = "subsumio-addin-token";

export function parseAddinClient(raw: unknown): AddinClient | null {
  return typeof raw === "string" && (ADDIN_CLIENTS as readonly string[]).includes(raw)
    ? (raw as AddinClient)
    : null;
}

export interface AddinDialogMessage {
  type: typeof ADDIN_DIALOG_MESSAGE_TYPE;
  client: AddinClient;
  token: string;
  expires_at: string;
}

/** The message string for `messageParent`; refuses anything but an add-in token. */
export function buildAddinDialogMessage(
  client: AddinClient,
  issued: { token?: unknown; expires_at?: unknown }
): string {
  if (typeof issued.token !== "string" || !issued.token.startsWith("sk_addin_")) {
    throw new Error("Kein gültiger Add-in-Zugang erhalten.");
  }
  if (typeof issued.expires_at !== "string" || !Number.isFinite(Date.parse(issued.expires_at))) {
    throw new Error("Ablaufzeit des Add-in-Zugangs fehlt.");
  }
  const message: AddinDialogMessage = {
    type: ADDIN_DIALOG_MESSAGE_TYPE,
    client,
    token: issued.token,
    expires_at: issued.expires_at,
  };
  return JSON.stringify(message);
}
