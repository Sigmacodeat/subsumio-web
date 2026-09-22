/**
 * court-channel.ts — Adapter-Schnittstelle für den elektronischen
 * Rechtsverkehr (ERV).
 *
 * AT: webERV/EKV via Justiz-Partnermiddleware.
 * DE: beA (§ 130a ZPO, § 130d — Anwaltspflicht) + eEB-Empfang
 *     (§ 174 ZPO i.V.m. § 4 ERVG).
 *
 * Echte beA-/ERV-Übertragung braucht Kanzlei-interne Infrastruktur
 * (beA-Kartenleser / webERV-Partnervertrag). Die produktive Architektur
 * ist daher ein lokales Gateway in der Kanzlei, das HTTPS-Requests der
 * Plattform an das Kartenterminal/JVA-Netz weiterreicht. Dieser Adapter
 * definiert den Vertrag; `resolveCourtChannel` liefert je nach
 * Kanzlei-Konfiguration den Gateway-Adapter oder einen sauberen
 * "nicht konfiguriert"-Zustand — niemals einen Mock.
 */

export type CourtChannelKind = "erv_at" | "bea_de";

export interface CourtChannelStatus {
  kind: CourtChannelKind;
  configured: boolean;
  reachable: boolean;
  /** Anzeigename des Postfachs (z. B. beA-Postfachadresse). */
  mailbox?: string;
  detail?: string;
}

export interface ErvDocument {
  /** Dateiname, z. B. "klage.docx" oder "schriftsatz.pdf". */
  filename: string;
  /** Base64-kodiertes Dokument. */
  contentBase64: string;
  mimeType: string;
}

export interface SchriftsatzRequest {
  /** Aktenzeichen des Gerichts. */
  azGericht?: string;
  /** Zielgericht (EKV-Gerichtskennzahl AT / Gerichtskennzahl DE). */
  gericht: string;
  /** Dokumentart, z. B. "klage", "schriftsatz", "antrag". */
  dokumenttyp: string;
  /** Interne Akte (Slug) für die Ablage des Sendenachweises. */
  caseSlug: string;
  betreff?: string;
  dokumente: ErvDocument[];
}

export interface SchriftsatzResult {
  /** Vom Übermittlungssystem vergebene Referenz (Nachweis). */
  reference: string;
  uebermitteltAm: string;
}

export interface EebNachricht {
  id: string;
  sender: string;
  betreff: string;
  empfangenAm: string;
  /** Zugehöriges Gerichtsverfahren, wenn aus dem Betreff ermittelbar. */
  azGericht?: string;
  gelesen: boolean;
}

export interface CourtChannelAdapter {
  readonly kind: CourtChannelKind;
  status(): Promise<CourtChannelStatus>;
  /** eEB-/ERV-Eingang auflisten (neueste zuerst). */
  listInbox(opts?: { limit?: number; unreadOnly?: boolean }): Promise<EebNachricht[]>;
  /** Nachricht als Original herunterladen (für die Aktenablage). */
  downloadMessage(
    id: string
  ): Promise<{ contentBase64: string; mimeType: string; filename: string }>;
  /** Schriftsatz sicher übermitteln. Wirft bei Nicht-Einrichtung. */
  sendSchriftsatz(req: SchriftsatzRequest): Promise<SchriftsatzResult>;
}

export class CourtChannelNotConfiguredError extends Error {
  constructor(kind: CourtChannelKind) {
    super(
      kind === "bea_de"
        ? "beA ist für diese Kanzlei nicht konfiguriert (Gateway-Adresse fehlt)."
        : "webERV ist für diese Kanzlei nicht konfiguriert (Partnermiddleware fehlt)."
    );
    this.name = "CourtChannelNotConfiguredError";
  }
}

export interface CourtChannelConfig {
  /** Basis-URL des kanzleieigenen Gateways (HTTPS, z. B.
   *  https://bea-gateway.kanzlei.example). */
  gatewayUrl?: string;
  /** Postfach-Identifikation (beA-Adresse / ERV-Teilnehmer-ID). */
  mailbox?: string;
  /** API-Schlüssel für das Gateway — Referenz auf das Secret, nie der
   *  Klartext. Wird als Bearer-Token an das Gateway gesendet. */
  apiKey?: string;
}

class NotConfiguredAdapter implements CourtChannelAdapter {
  constructor(public readonly kind: CourtChannelKind) {}
  status(): Promise<CourtChannelStatus> {
    return Promise.resolve({ kind: this.kind, configured: false, reachable: false });
  }
  listInbox(): Promise<EebNachricht[]> {
    return Promise.reject(new CourtChannelNotConfiguredError(this.kind));
  }
  downloadMessage(): Promise<never> {
    return Promise.reject(new CourtChannelNotConfiguredError(this.kind));
  }
  sendSchriftsatz(): Promise<never> {
    return Promise.reject(new CourtChannelNotConfiguredError(this.kind));
  }
}

/** HTTPS-Gateway-Adapter: spricht mit der kanzleieigenen Middleware, die
 *  den Kartenterminal-Zugang kapselt (beA Safe / webERV-Partner). */
export class GatewayCourtChannelAdapter implements CourtChannelAdapter {
  constructor(
    public readonly kind: CourtChannelKind,
    private readonly config: Required<Pick<CourtChannelConfig, "gatewayUrl">> & CourtChannelConfig
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.gatewayUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`${this.kind} gateway error ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async status(): Promise<CourtChannelStatus> {
    try {
      const s = await this.call<{ ok: boolean }>("/status");
      return {
        kind: this.kind,
        configured: true,
        reachable: s.ok === true,
        mailbox: this.config.mailbox,
      };
    } catch {
      return {
        kind: this.kind,
        configured: true,
        reachable: false,
        mailbox: this.config.mailbox,
        detail: "Gateway nicht erreichbar",
      };
    }
  }

  listInbox(opts?: { limit?: number; unreadOnly?: boolean }): Promise<EebNachricht[]> {
    const q = new URLSearchParams();
    if (opts?.limit) q.set("limit", String(opts.limit));
    if (opts?.unreadOnly) q.set("unread", "1");
    return this.call<EebNachricht[]>(`/inbox?${q}`);
  }

  downloadMessage(
    id: string
  ): Promise<{ contentBase64: string; mimeType: string; filename: string }> {
    return this.call(`/messages/${encodeURIComponent(id)}/download`);
  }

  sendSchriftsatz(req: SchriftsatzRequest): Promise<SchriftsatzResult> {
    return this.call("/send", { method: "POST", body: JSON.stringify(req) });
  }
}

/** Liefert den Adapter für die Kanzlei — oder den sauberen
 *  nicht-konfiguriert-Zustand, der im UI als Einrichtungshinweis
 *  erscheint. */
export function resolveCourtChannel(
  kind: CourtChannelKind,
  config: CourtChannelConfig | undefined
): CourtChannelAdapter {
  if (config?.gatewayUrl) {
    return new GatewayCourtChannelAdapter(kind, { ...config, gatewayUrl: config.gatewayUrl });
  }
  return new NotConfiguredAdapter(kind);
}
