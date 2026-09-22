/**
 * filing-transport.ts — Einheitliche Transport-Schnittstelle für
 * elektronischen Rechtsverkehr (beA, ERV, eFiling).
 *
 * Analog zum Register-Adapter: normalisierter Vertrag, pro Kanal/Partner
 * nur die konkrete Implementierung. Ohne Partner-Konfiguration liefert
 * `resolveFilingTransport` einen sauberen „nicht konfiguriert"-Zustand,
 * niemals simulierte Versand-Erfolge.
 */

import type { FilingChannel, FilingReceipt } from "@/lib/efiling-architecture";

export interface FilingTransportConfig {
  /** Basis-URL des Middleware-/Partner-Endpunkts. */
  endpoint?: string;
  /** API-Schlüssel — Referenz auf das Secret, nie Klartext im Repo. */
  apiKey?: string;
  /** Absender-ID (z. B. beA-Safe-ID, ERV-Absenderkennung). */
  senderId?: string;
}

export interface FilingSendRequest {
  filingId: string;
  /** XJustiz-XML-Payload. */
  xml: string;
  court: string;
  caseNumber?: string;
  priority: string;
  deadlineDate?: string;
}

export interface FilingSendResult {
  receipt: FilingReceipt;
  /** Vom Transport vergebene Referenz (Middleware-Reference). */
  transportReference: string;
  /** Rohdaten der Partner-Antwort (gekürzt), für Audit/Protokoll. */
  raw: unknown;
}

export interface FilingTransportStatus {
  channel: FilingChannel;
  configured: boolean;
  reachable: boolean;
  detail?: string;
}

export interface FilingTransportAdapter {
  readonly channel: FilingChannel;
  status(): Promise<FilingTransportStatus>;
  /**
   * Sendet das Filing-Paket. Wirft bei Transport-/Partner-Fehlern;
   * inhaltliche Ablehnungen kommen als `receipt.is_success = false`.
   */
  send(request: FilingSendRequest): Promise<FilingSendResult>;
}

export class FilingTransportNotConfiguredError extends Error {
  constructor(public readonly channel: FilingChannel) {
    super(`Transport für ${channel} ist nicht konfiguriert (Partner-Endpunkt fehlt).`);
    this.name = "FilingTransportNotConfiguredError";
  }
}

class NotConfiguredFilingTransport implements FilingTransportAdapter {
  constructor(public readonly channel: FilingChannel) {}
  status(): Promise<FilingTransportStatus> {
    return Promise.resolve({ channel: this.channel, configured: false, reachable: false });
  }
  send(): Promise<FilingSendResult> {
    return Promise.reject(new FilingTransportNotConfiguredError(this.channel));
  }
}

/** HTTP-Transport für einen konfigurierten Middleware-Endpunkt. */
export class HttpFilingTransportAdapter implements FilingTransportAdapter {
  constructor(
    public readonly channel: FilingChannel,
    private readonly config: Required<Pick<FilingTransportConfig, "endpoint" | "apiKey">> &
      FilingTransportConfig
  ) {}

  async status(): Promise<FilingTransportStatus> {
    try {
      const res = await fetch(`${this.config.endpoint}/status`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      return {
        channel: this.channel,
        configured: true,
        reachable: res.ok,
        detail: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch {
      return {
        channel: this.channel,
        configured: true,
        reachable: false,
        detail: "Endpunkt nicht erreichbar",
      };
    }
  }

  async send(request: FilingSendRequest): Promise<FilingSendResult> {
    const path = this.channel === "beA" ? "/api/v1/bea/send" : "/api/v1/filing/send";
    const res = await fetch(`${this.config.endpoint}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        filing_id: request.filingId,
        xml: request.xml,
        court: request.court,
        case_number: request.caseNumber,
        priority: request.priority,
        deadline_date: request.deadlineDate,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Middleware-Versand fehlgeschlagen: HTTP ${res.status} — ${errText.slice(0, 500)}`
      );
    }

    const data = await res.json();
    return {
      transportReference: data.transport_reference ?? `middleware-${Date.now()}`,
      raw: data,
      receipt: {
        receipt_id: data.receipt_id ?? `receipt-${Date.now()}`,
        received_at: data.received_at ?? new Date().toISOString(),
        received_by: data.received_by ?? "middleware",
        confirmation_code: data.confirmation_code ?? "",
        raw_response: JSON.stringify(data).slice(0, 5000),
        is_success: data.is_success !== false,
        error_code: data.error_code,
        error_message: data.error_message,
      },
    };
  }
}

export function resolveFilingTransport(
  channel: FilingChannel,
  config: FilingTransportConfig | undefined
): FilingTransportAdapter {
  if (config?.endpoint && config?.apiKey) {
    return new HttpFilingTransportAdapter(channel, {
      ...config,
      endpoint: config.endpoint,
      apiKey: config.apiKey,
    });
  }
  return new NotConfiguredFilingTransport(channel);
}
