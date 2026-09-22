/**
 * rksv-adapter.ts — Schnittstelle für RKSV-Signatureinheiten (§ 131 BAO).
 *
 * Bar- und Kartenzahlungen müssen mit einer Sicherheitseinrichtung
 * signiert werden (Signaturkarte/HSM via A-Trust, fiskaltrust u. a.).
 * Der Adapter normalisiert den Vertrag; ohne konfigurierte
 * Signatureinheit liefert `resolveRksvAdapter` einen sauberen
 * „nicht konfiguriert"-Zustand — nie unsignierte Belege als RKSV-
 * konform ausgeben.
 */

export interface RksvReceiptInput {
  /** Belegnummer der Registrierkasse. */
  receiptNumber: string;
  /** Kassen-ID (RKSV-Registrierung beim BMF). */
  cashRegisterId: string;
  /** Beträge nach Steuersatz in Cent. */
  amounts: {
    normal?: number;
    ermaessigt1?: number;
    ermaessigt2?: number;
    null_satz?: number;
    besonders?: number;
  };
  /** Verkettungswert des vorherigen Belegs (Base64). */
  previousReceiptHash: string;
  timestamp?: string;
}

export interface RksvSignedReceipt extends RksvReceiptInput {
  /** Maschinenlesbarer Code (OCR) — kompletter QR-Code-Payload. */
  qrPayload: string;
  /** Signaturwert (Base64). */
  signature: string;
  /** Seriennummer des Signaturzertifikats (hex). */
  certificateSerial: string;
  /** JWS-kompakte Signatur (RKSV-DEP-Format). */
  jwsCompact: string;
}

export interface RksvStatus {
  configured: boolean;
  reachable: boolean;
  /** Zertifikat-Seriennummer, wenn bekannt. */
  certificateSerial?: string;
  /** Tage bis Zertifikatsablauf, wenn bekannt. */
  certificateDaysLeft?: number;
  detail?: string;
}

export interface RksvAdapter {
  status(): Promise<RksvStatus>;
  sign(receipt: RksvReceiptInput): Promise<RksvSignedReceipt>;
  /** DEP-Export (Datenerfassungsprotokoll) für Prüfungen. */
  exportDep(from: string, to: string): Promise<{ entries: unknown[] }>;
}

export class RksvNotConfiguredError extends Error {
  constructor() {
    super("RKSV-Signatureinheit ist nicht konfiguriert (z. B. A-Trust/fiskaltrust).");
    this.name = "RksvNotConfiguredError";
  }
}

class NotConfiguredRksvAdapter implements RksvAdapter {
  status(): Promise<RksvStatus> {
    return Promise.resolve({ configured: false, reachable: false });
  }
  sign(): Promise<RksvSignedReceipt> {
    return Promise.reject(new RksvNotConfiguredError());
  }
  exportDep(): Promise<{ entries: unknown[] }> {
    return Promise.reject(new RksvNotConfiguredError());
  }
}

export interface RksvConfig {
  /** Basis-URL des Signaturdiensts (z. B. fiskaltrust-Middleware). */
  endpoint?: string;
  apiKey?: string;
  cashRegisterId?: string;
}

export class HttpRksvAdapter implements RksvAdapter {
  constructor(
    private readonly config: Required<Pick<RksvConfig, "endpoint" | "apiKey">> & RksvConfig
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.endpoint}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`RKSV-Dienst antwortet HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async status(): Promise<RksvStatus> {
    try {
      const s = await this.call<{
        ok: boolean;
        certificate_serial?: string;
        cert_days_left?: number;
      }>("/status");
      return {
        configured: true,
        reachable: s.ok === true,
        certificateSerial: s.certificate_serial,
        certificateDaysLeft: s.cert_days_left,
      };
    } catch {
      return { configured: true, reachable: false, detail: "Signaturdienst nicht erreichbar" };
    }
  }

  sign(receipt: RksvReceiptInput): Promise<RksvSignedReceipt> {
    return this.call<RksvSignedReceipt>("/sign", {
      method: "POST",
      body: JSON.stringify(receipt),
    });
  }

  exportDep(from: string, to: string): Promise<{ entries: unknown[] }> {
    const q = new URLSearchParams({ from, to });
    return this.call<{ entries: unknown[] }>(`/dep?${q}`);
  }
}

export function resolveRksvAdapter(config: RksvConfig | undefined): RksvAdapter {
  if (config?.endpoint && config?.apiKey) {
    return new HttpRksvAdapter({ ...config, endpoint: config.endpoint, apiKey: config.apiKey });
  }
  return new NotConfiguredRksvAdapter();
}
