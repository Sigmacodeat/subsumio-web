/**
 * register-adapter.ts — Einheitliche Schnittstelle für Registerabfragen.
 *
 * AT: Firmenbuch, Grundbuch, Zentrales Testamentsregister, Ediktsdatei.
 * DE: Handelsregister, Unternehmensregister, Insolvenzbekanntmachungen,
 *     Vollstreckungsportal.
 *
 * Die produktiven Abfragen laufen über lizenzierte Register-Partner —
 * dieser Adapter definiert den normalisierten Vertrag, sodass pro
 * Register/Partner nur noch die konkrete Implementierung ergänzt wird.
 * Ohne Partner-Konfiguration liefert `resolveRegisterAdapter` einen
 * sauberen "nicht konfiguriert"-Zustand, niemals erfundene Daten.
 */

export type RegisterKind =
  | "firmenbuch_at"
  | "grundbuch_at"
  | "handelsregister_de"
  | "unternehmensregister_de"
  | "insolvenz_de"
  | "vollstreckungsportal_de";

export type RegisterJurisdiction = "at" | "de";

export const REGISTER_JURISDICTION: Record<RegisterKind, RegisterJurisdiction> = {
  firmenbuch_at: "at",
  grundbuch_at: "at",
  handelsregister_de: "de",
  unternehmensregister_de: "de",
  insolvenz_de: "de",
  vollstreckungsportal_de: "de",
};

export const REGISTER_LABEL: Record<RegisterKind, string> = {
  firmenbuch_at: "Firmenbuch (AT)",
  grundbuch_at: "Grundbuch (AT)",
  handelsregister_de: "Handelsregister (DE)",
  unternehmensregister_de: "Unternehmensregister (DE)",
  insolvenz_de: "Insolvenzbekanntmachungen (DE)",
  vollstreckungsportal_de: "Vollstreckungsportal (DE)",
};

export interface RegisterSearchQuery {
  /** Firma, Name oder Stichwort. */
  query?: string;
  /** Registernummer (FN AT / HRB-Nummer DE). */
  registerNumber?: string;
  /** Registergericht (DE) bzw. Firmenbuchgericht (AT). */
  court?: string;
  limit?: number;
}

export interface RegisterEntry {
  /** Normalisierte ID, die `getAuszug` wieder auflösen kann. */
  id: string;
  name: string;
  legalForm?: string;
  registerNumber?: string;
  court?: string;
  address?: string;
  /** "aktiv" | "gelöscht" | "im_verfahren" — normalisiert. */
  status?: string;
  source: RegisterKind;
}

export interface RegisterAuszug {
  entry: RegisterEntry;
  /** Volltext/Auszugsdaten, normalisiert als Schlüssel-Wert-Paare. */
  sections: Array<{ title: string; content: string }>;
  abgerufenAm: string;
  /** Amtlicher Auszug als PDF, wenn der Partner ihn liefert. */
  pdfBase64?: string;
}

export interface RegisterStatus {
  kind: RegisterKind;
  jurisdiction: RegisterJurisdiction;
  configured: boolean;
  reachable: boolean;
  detail?: string;
}

export interface RegisterAdapter {
  readonly kind: RegisterKind;
  status(): Promise<RegisterStatus>;
  search(query: RegisterSearchQuery): Promise<RegisterEntry[]>;
  getAuszug(id: string): Promise<RegisterAuszug>;
}

export class RegisterNotConfiguredError extends Error {
  constructor(public readonly kind: RegisterKind) {
    super(`${REGISTER_LABEL[kind]} ist nicht konfiguriert (Partnerzugang fehlt).`);
    this.name = "RegisterNotConfiguredError";
  }
}

export interface RegisterConfig {
  /** Basis-URL des Partner-Endpunkts. */
  endpoint?: string;
  /** API-Schlüssel — Referenz auf das Secret, nie Klartext im Repo. */
  apiKey?: string;
}

class NotConfiguredRegisterAdapter implements RegisterAdapter {
  constructor(public readonly kind: RegisterKind) {}
  status(): Promise<RegisterStatus> {
    return Promise.resolve({
      kind: this.kind,
      jurisdiction: REGISTER_JURISDICTION[this.kind],
      configured: false,
      reachable: false,
    });
  }
  search(): Promise<RegisterEntry[]> {
    return Promise.reject(new RegisterNotConfiguredError(this.kind));
  }
  getAuszug(): Promise<never> {
    return Promise.reject(new RegisterNotConfiguredError(this.kind));
  }
}

/** HTTP-Adapter für einen konfigurierten Partner-Endpunkt. */
export class HttpRegisterAdapter implements RegisterAdapter {
  constructor(
    public readonly kind: RegisterKind,
    private readonly config: Required<Pick<RegisterConfig, "endpoint">> & RegisterConfig
  ) {}

  private async call<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.endpoint}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${this.kind} partner error ${res.status}`);
    return (await res.json()) as T;
  }

  async status(): Promise<RegisterStatus> {
    try {
      const s = await this.call<{ ok: boolean }>("/status");
      return {
        kind: this.kind,
        jurisdiction: REGISTER_JURISDICTION[this.kind],
        configured: true,
        reachable: s.ok === true,
      };
    } catch {
      return {
        kind: this.kind,
        jurisdiction: REGISTER_JURISDICTION[this.kind],
        configured: true,
        reachable: false,
        detail: "Partner-Endpunkt nicht erreichbar",
      };
    }
  }

  search(query: RegisterSearchQuery): Promise<RegisterEntry[]> {
    const q = new URLSearchParams();
    if (query.query) q.set("q", query.query);
    if (query.registerNumber) q.set("number", query.registerNumber);
    if (query.court) q.set("court", query.court);
    if (query.limit) q.set("limit", String(query.limit));
    return this.call<RegisterEntry[]>(`/search?${q}`);
  }

  getAuszug(id: string): Promise<RegisterAuszug> {
    return this.call<RegisterAuszug>(`/auszug/${encodeURIComponent(id)}`);
  }
}

export function resolveRegisterAdapter(
  kind: RegisterKind,
  config: RegisterConfig | undefined
): RegisterAdapter {
  if (config?.endpoint) {
    return new HttpRegisterAdapter(kind, { ...config, endpoint: config.endpoint });
  }
  return new NotConfiguredRegisterAdapter(kind);
}

/** Alle Register einer Jurisdiktion mit ihrem Konfigurationsstatus. */
export async function registerStatusOverview(
  jurisdiction: RegisterJurisdiction,
  configs: Partial<Record<RegisterKind, RegisterConfig>>
): Promise<RegisterStatus[]> {
  const kinds = (Object.keys(REGISTER_JURISDICTION) as RegisterKind[]).filter(
    (k) => REGISTER_JURISDICTION[k] === jurisdiction
  );
  return Promise.all(kinds.map((k) => resolveRegisterAdapter(k, configs[k]).status()));
}
