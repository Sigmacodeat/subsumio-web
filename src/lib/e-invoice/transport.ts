/**
 * E-Rechnung-Versand (WP-8.47)
 * =============================
 * Transport-Schicht für erzeugte e-Rechnungen. Kanäle:
 *  - "peppol":          PEPPOL Access Point (generischer REST-Uplink,
 *                       ENV: EINVOICE_PEPPOL_URL + EINVOICE_PEPPOL_TOKEN)
 *  - "erechnung_gv_at": e-Rechnung an die österreichische Bundesverwaltung
 *                       (e-Rechnung.gv.at Webservice,
 *                       ENV: EINVOICE_ERV_URL + EINVOICE_ERV_TOKEN)
 *
 * Ohne konfigurierte ENV liefert der Versand ehrlich `not_configured`
 * statt zu simulieren — der Download bleibt der produktive Weg.
 */

export type EInvoiceChannel = "peppol" | "erechnung_gv_at";

export type TransportStatus = "delivered" | "queued" | "not_configured" | "failed";

export interface TransportResult {
  status: TransportStatus;
  channel: EInvoiceChannel;
  /** Referenz/Übertragungs-ID des Access Points, falls vorhanden. */
  reference?: string;
  message: string;
}

export interface TransportMeta {
  invoiceNumber: string;
  format: "ebinterface" | "xrechnung";
  /** Empfänger-Identifier: Leitweg-ID (XRechnung) bzw. Auftraggeberkennzahl. */
  receiverId?: string;
}

export function transportAvailability(): Record<EInvoiceChannel, boolean> {
  return {
    peppol: Boolean(process.env.EINVOICE_PEPPOL_URL && process.env.EINVOICE_PEPPOL_TOKEN),
    erechnung_gv_at: Boolean(process.env.EINVOICE_ERV_URL && process.env.EINVOICE_ERV_TOKEN),
  };
}

function notConfigured(channel: EInvoiceChannel): TransportResult {
  const envHint =
    channel === "peppol"
      ? "EINVOICE_PEPPOL_URL/EINVOICE_PEPPOL_TOKEN"
      : "EINVOICE_ERV_URL/EINVOICE_ERV_TOKEN";
  return {
    status: "not_configured",
    channel,
    message:
      channel === "peppol"
        ? `Kein PEPPOL-Access-Point konfiguriert (${envHint}). Die XML-Datei kann weiterhin heruntergeladen und manuell übermittelt werden.`
        : `e-Rechnung.gv.at-Webservice nicht konfiguriert (${envHint}). Die XML-Datei kann im e-Rechnungs-Portal hochgeladen werden.`,
  };
}

async function postXml(
  url: string,
  token: string,
  xml: string,
  meta: TransportMeta,
  extraFields?: Record<string, string>
): Promise<{ status: TransportStatus; reference?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/xml",
      "X-Invoice-Number": meta.invoiceNumber,
      ...(meta.receiverId ? { "X-Receiver-Id": meta.receiverId } : {}),
      ...(extraFields
        ? Object.fromEntries(Object.entries(extraFields).map(([k, v]) => [`X-${k}`, v]))
        : {}),
    },
    body: xml,
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await res.json().catch(() => ({}))) as {
    reference?: string;
    id?: string;
    status?: string;
  };
  if (!res.ok) throw new Error(`Transport HTTP ${res.status}`);
  return {
    status: body.status === "delivered" ? "delivered" : "queued",
    reference: body.reference ?? body.id,
  };
}

function channelEndpoint(channel: EInvoiceChannel): { url?: string; token?: string } {
  return channel === "peppol"
    ? { url: process.env.EINVOICE_PEPPOL_URL, token: process.env.EINVOICE_PEPPOL_TOKEN }
    : { url: process.env.EINVOICE_ERV_URL, token: process.env.EINVOICE_ERV_TOKEN };
}

/**
 * Zustellstatus einer bereits eingereichten e-Rechnung abfragen
 * (Referenz vom Access Point). Konvention: GET {url}/status?reference=<id>.
 */
export async function pollEInvoiceStatus(
  channel: EInvoiceChannel,
  reference: string
): Promise<TransportResult> {
  const { url, token } = channelEndpoint(channel);
  if (!url || !token) return notConfigured(channel);
  try {
    const base = url.replace(/\/+$/, "");
    const res = await fetch(`${base}/status?reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Transport HTTP ${res.status}`);
    const body = (await res.json()) as { status?: string; message?: string };
    const status: TransportStatus =
      body.status === "delivered" ? "delivered" : body.status === "failed" ? "failed" : "queued";
    return {
      status,
      channel,
      reference,
      message:
        body.message ??
        (status === "delivered"
          ? "Zustellung bestätigt."
          : status === "failed"
            ? "Zustellung fehlgeschlagen."
            : "Übertragung noch in Bearbeitung."),
    };
  } catch (err) {
    return {
      status: "failed",
      channel,
      reference,
      message: `Statusabfrage fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function sendEInvoice(
  channel: EInvoiceChannel,
  xml: string,
  meta: TransportMeta
): Promise<TransportResult> {
  if (channel === "peppol") {
    const url = process.env.EINVOICE_PEPPOL_URL;
    const token = process.env.EINVOICE_PEPPOL_TOKEN;
    if (!url || !token) return notConfigured(channel);
    try {
      const r = await postXml(url, token, xml, meta);
      return {
        status: r.status,
        channel,
        reference: r.reference,
        message:
          r.status === "delivered"
            ? "e-Rechnung wurde über PEPPOL zugestellt."
            : "e-Rechnung wurde beim PEPPOL-Access-Point eingereicht.",
      };
    } catch (err) {
      return {
        status: "failed",
        channel,
        message: `PEPPOL-Übertragung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const url = process.env.EINVOICE_ERV_URL;
  const token = process.env.EINVOICE_ERV_TOKEN;
  if (!url || !token) return notConfigured(channel);
  if (meta.format !== "ebinterface") {
    return {
      status: "failed",
      channel,
      message: "e-Rechnung.gv.at akzeptiert ausschließlich das ebInterface-Format.",
    };
  }
  try {
    const r = await postXml(url, token, xml, meta);
    return {
      status: r.status,
      channel,
      reference: r.reference,
      message:
        r.status === "delivered"
          ? "e-Rechnung wurde an e-Rechnung.gv.at zugestellt."
          : "e-Rechnung wurde bei e-Rechnung.gv.at eingereicht.",
    };
  } catch (err) {
    return {
      status: "failed",
      channel,
      message: `Übertragung an e-Rechnung.gv.at fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
