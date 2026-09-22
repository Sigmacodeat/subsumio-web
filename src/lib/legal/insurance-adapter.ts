/**
 * insurance-adapter.ts — Konkrete Implementierung des
 * LegalInsuranceProvider-Vertrags (legal-insurance.ts).
 *
 * Erste produktive Ausprägung: drebis-API (oder ein beliebiger
 * RSV-Partner mit REST-Schnittstelle). Ohne Partner-Konfiguration
 * liefert `resolveInsuranceProvider` einen sauberen „nicht
 * konfiguriert"-Zustand — die Deckungsanfrage läuft dann über den
 * strukturierten E-Mail-Fallback (`buildCoverageInquiryEmail`).
 */

import type { LegalInsuranceProvider, CoverageResult, CoverageStatus } from "@/lib/legal-insurance";

export class InsuranceNotConfiguredError extends Error {
  constructor(public readonly providerName: string) {
    super(`Rechtsschutz-Provider ${providerName} ist nicht konfiguriert (Partnerzugang fehlt).`);
    this.name = "InsuranceNotConfiguredError";
  }
}

export interface InsuranceProviderConfig {
  endpoint?: string;
  apiKey?: string;
}

class NotConfiguredInsuranceProvider implements LegalInsuranceProvider {
  constructor(public readonly name: string) {}
  inquireCoverage(): Promise<CoverageResult> {
    return Promise.reject(new InsuranceNotConfiguredError(this.name));
  }
  checkStatus(): Promise<CoverageStatus> {
    return Promise.reject(new InsuranceNotConfiguredError(this.name));
  }
}

export class HttpInsuranceProvider implements LegalInsuranceProvider {
  constructor(
    public readonly name: string,
    private readonly config: Required<Pick<InsuranceProviderConfig, "endpoint" | "apiKey">>
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.endpoint}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${this.name} antwortet HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  inquireCoverage(input: {
    case_slug: string;
    client_name: string;
    client_email?: string;
    insurance_number?: string;
    matter: string;
    legal_area: string;
    dispute_value?: number;
  }): Promise<CoverageResult> {
    return this.call<CoverageResult>("/coverage/inquire", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  checkStatus(reference: string): Promise<CoverageStatus> {
    return this.call<CoverageStatus>(`/coverage/${encodeURIComponent(reference)}`);
  }
}

export function resolveInsuranceProvider(
  name: string,
  config: InsuranceProviderConfig | undefined
): LegalInsuranceProvider {
  if (config?.endpoint && config?.apiKey) {
    return new HttpInsuranceProvider(name, {
      ...config,
      endpoint: config.endpoint,
      apiKey: config.apiKey,
    });
  }
  return new NotConfiguredInsuranceProvider(name);
}
