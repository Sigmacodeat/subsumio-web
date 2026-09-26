/**
 * Result of an OAuth round trip (Outlook, DocuSign) as the provider's
 * callback reports it on the settings page (`?outlook=…`, `?docusign=…`).
 */
export interface IntegrationReturnToast {
  type: "success" | "error" | "info";
  title: string;
}

const REASONS: Record<string, string> = {
  denied: "Die Freigabe wurde abgelehnt.",
  state_mismatch:
    "Die Anmeldung ist abgelaufen oder wurde in einem anderen Tab gestartet. Bitte erneut verbinden.",
  code_required: "Die Anmeldung wurde nicht abgeschlossen. Bitte erneut verbinden.",
  token_exchange_failed: "Die Verbindung konnte nicht hergestellt werden. Bitte erneut versuchen.",
  not_configured: "Die Anbindung ist für diese Installation nicht eingerichtet.",
};

export function integrationReturnToast(params: URLSearchParams): IntegrationReturnToast | null {
  for (const [key, name] of [
    ["outlook", "Outlook-Kalender"],
    ["docusign", "DocuSign"],
  ] as const) {
    const value = params.get(key);
    if (!value) continue;
    if (value === "connected") return { type: "success", title: `${name} verbunden` };
    return {
      type: "error",
      title: `${name}: ${REASONS[value] ?? "Die Verbindung ist fehlgeschlagen."}`,
    };
  }
  return null;
}

/** The query string without the one-shot result parameters. */
export function withoutIntegrationReturn(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete("outlook");
  next.delete("docusign");
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}
