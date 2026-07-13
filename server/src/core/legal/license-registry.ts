/**
 * License Registry — Rechte- und Lizenzschicht für Rechtsquellen
 *
 * T3.6: Jede Source hat eine dokumentierte Lizenz. Geschützte Inhalte
 * (Kommentare, Verlagsliteratur) dürfen ohne Lizenz nicht importiert werden.
 *
 * Features:
 *   - License Registry pro Source (DB-backed)
 *   - Scraping-/API-Nutzungsbedingungen dokumentiert
 *   - License Review Workflow mit human approval
 *   - Verlagspartnerschaften über gleiche Source API
 *
 * @module server/src/core/legal/license-registry
 */

import type { Pool } from "pg";
import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────

export type LicenseType =
  | "public" // Gesetz im öffentlichen Interesse, frei nutzbar
  | "open" // Open Data License (CC-BY, CC0, ODbL)
  | "commercial" // Kommerzielle Lizenz (Verlagspartnerschaft)
  | "restricted" // Eingeschränkte Nutzung (nur Forschung, nur intern)
  | "pending"; // Noch nicht geklärt

export interface LicenseReview {
  id: number;
  source_id: string;
  reviewer_id: string;
  reviewed_at: string;
  license_type: LicenseType;
  terms_url: string | null;
  scraping_allowed: boolean;
  api_usage_allowed: boolean;
  attribution_required: boolean;
  commercial_use_allowed: boolean;
  notes: string | null;
  approved: boolean;
}

export interface LicenseReviewInput {
  source_id: string;
  reviewer_id: string;
  license_type: LicenseType;
  terms_url?: string;
  scraping_allowed?: boolean;
  api_usage_allowed?: boolean;
  attribution_required?: boolean;
  commercial_use_allowed?: boolean;
  notes?: string;
  approved?: boolean;
}

/**
 * Known license terms for official legal sources.
 * This is a static registry of the terms of use for each known source,
 * documented for compliance purposes.
 */
export interface SourceLicenseTerms {
  source_id: string;
  source_name: string;
  jurisdiction: string;
  official_url: string;
  license_type: LicenseType;
  terms_url: string;
  scraping_allowed: boolean;
  api_usage_allowed: boolean;
  attribution_required: boolean;
  commercial_use_allowed: boolean;
  notes: string;
}

// ── Static License Terms Registry ─────────────────────────────────────

/**
 * Documented license terms for all known legal sources.
 *
 * This serves as the compliance documentation required by T3.6.
 * Every source that is scraped or accessed via API must have its
 * terms documented here.
 */
export const KNOWN_LICENSE_TERMS: SourceLicenseTerms[] = [
  // ── DE ──────────────────────────────────────────────────────────────
  {
    source_id: "law-de",
    source_name: "gesetze-im-internet.de",
    jurisdiction: "DE",
    official_url: "https://www.gesetze-im-internet.de/",
    license_type: "public",
    terms_url: "https://www.gesetze-im-internet.de/impressum.html",
    scraping_allowed: true,
    api_usage_allowed: true,
    attribution_required: false,
    commercial_use_allowed: true,
    notes:
      "Gesetze im öffentlichen Interesse. Bundesministerium der Justiz stellt diese kostenlos zur Verfügung. NL-XML API verfügbar.",
  },
  {
    source_id: "law-de-judikatur",
    source_name: "BGH Entscheidungen (juris DIPPER)",
    jurisdiction: "DE",
    official_url: "https://www.bundesgerichtshof.de/",
    license_type: "public",
    terms_url: "https://www.bundesgerichtshof.de/DE/Home/impressum.html",
    scraping_allowed: true,
    api_usage_allowed: false,
    attribution_required: true,
    commercial_use_allowed: true,
    notes:
      "BGH-Entscheidungen über RSS-Feeds. Urteile sind öffentlich. Kommerzielle Verwertung von ECLI-Referenzen erlaubt.",
  },
  // ── AT ──────────────────────────────────────────────────────────────
  {
    source_id: "law-at",
    source_name: "RIS-OGD (Bundeskanzleramt)",
    jurisdiction: "AT",
    official_url: "https://www.ris.bka.gv.at/",
    license_type: "open",
    terms_url: "https://www.ris.bka.gv.at/Seite.aspx?name=Impressum",
    scraping_allowed: true,
    api_usage_allowed: true,
    attribution_required: true,
    commercial_use_allowed: true,
    notes:
      "RIS-OGD API v2.6. Open Government Data Initiative. CC-BY 4.0 Lizenz. Quellenangabe erforderlich.",
  },
  {
    source_id: "law-at-judikatur",
    source_name: "OGH Judikatur (RIS)",
    jurisdiction: "AT",
    official_url: "https://www.ris.bka.gv.at/Judikatur/",
    license_type: "open",
    terms_url: "https://www.ris.bka.gv.at/Seite.aspx?name=Impressum",
    scraping_allowed: true,
    api_usage_allowed: true,
    attribution_required: true,
    commercial_use_allowed: true,
    notes:
      "OGH-Entscheidungen über RIS-OGD API. CC-BY 4.0. Entscheidungen sind öffentlich (§ 19 GOG).",
  },
  // ── CH ──────────────────────────────────────────────────────────────
  {
    source_id: "law-ch",
    source_name: "Fedlex (Bundeskanzlei)",
    jurisdiction: "CH",
    official_url: "https://www.fedlex.data.admin.ch/",
    license_type: "open",
    terms_url: "https://www.fedlex.data.admin.ch/de/cc/license",
    scraping_allowed: true,
    api_usage_allowed: true,
    attribution_required: false,
    commercial_use_allowed: true,
    notes:
      "Fedlex Open Data. CC0 1.0 (Public Domain Dedication). Keine Quellenangabe erforderlich.",
  },
  {
    source_id: "law-ch-judikatur",
    source_name: "Bundesgerichtsentscheide (BGer)",
    jurisdiction: "CH",
    official_url: "https://www.bger.ch/",
    license_type: "public",
    terms_url: "https://www.bger.ch/de/impressum.html",
    scraping_allowed: true,
    api_usage_allowed: false,
    attribution_required: true,
    commercial_use_allowed: true,
    notes: "BGer-Entscheidungen über RSS-Feeds. Öffentliche Entscheide. Quellenangabe empfohlen.",
  },
  // ── EU ──────────────────────────────────────────────────────────────
  {
    source_id: "law-eu",
    source_name: "EUR-Lex",
    jurisdiction: "EU",
    official_url: "https://eur-lex.europa.eu/",
    license_type: "open",
    terms_url:
      "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=uriserv:OJ.C_2016.263.01.0001.01.ENG",
    scraping_allowed: true,
    api_usage_allowed: true,
    attribution_required: false,
    commercial_use_allowed: true,
    notes:
      "EUR-Lex Web Services. CC-BY 4.0. EU-Gesetzgebung ist gemeinfrei. SOAP/REST API verfügbar.",
  },
];

// ── License Registry Store ────────────────────────────────────────────

/**
 * LicenseRegistryStore — DB-backed license review management.
 */
export class LicenseRegistryStore {
  constructor(private pool: Pool) {}

  /**
   * Record a license review for a source.
   */
  async recordReview(input: LicenseReviewInput): Promise<LicenseReview> {
    const result = await this.pool.query(
      `INSERT INTO source_license_reviews
       (source_id, reviewer_id, license_type, terms_url, scraping_allowed,
        api_usage_allowed, attribution_required, commercial_use_allowed, notes, approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.source_id,
        input.reviewer_id,
        input.license_type,
        input.terms_url ?? null,
        input.scraping_allowed ?? false,
        input.api_usage_allowed ?? false,
        input.attribution_required ?? false,
        input.commercial_use_allowed ?? false,
        input.notes ?? null,
        input.approved ?? false,
      ]
    );
    return rowToLicenseReview(result.rows[0]!);
  }

  /**
   * Get the latest approved license review for a source.
   */
  async getLatestApproved(sourceId: string): Promise<LicenseReview | null> {
    const result = await this.pool.query(
      `SELECT * FROM source_license_reviews
       WHERE source_id = $1 AND approved = true
       ORDER BY reviewed_at DESC LIMIT 1`,
      [sourceId]
    );
    if (!result.rows[0]) return null;
    return rowToLicenseReview(result.rows[0]);
  }

  /**
   * Get all license reviews for a source (history).
   */
  async getReviewHistory(sourceId: string): Promise<LicenseReview[]> {
    const result = await this.pool.query(
      `SELECT * FROM source_license_reviews
       WHERE source_id = $1
       ORDER BY reviewed_at DESC`,
      [sourceId]
    );
    return result.rows.map(rowToLicenseReview);
  }

  /**
   * Check if a source has a valid (approved) license for the intended use.
   */
  async hasValidLicense(
    sourceId: string,
    use: "scraping" | "api" | "commercial"
  ): Promise<boolean> {
    const review = await this.getLatestApproved(sourceId);
    if (!review) return false;

    if (use === "scraping" && !review.scraping_allowed) return false;
    if (use === "api" && !review.api_usage_allowed) return false;
    if (use === "commercial" && !review.commercial_use_allowed) return false;

    return true;
  }

  /**
   * Get the license terms for a source, either from DB or static registry.
   */
  async getLicenseTerms(sourceId: string): Promise<SourceLicenseTerms | null> {
    // Check DB first (dynamic reviews)
    const review = await this.getLatestApproved(sourceId);
    if (review) {
      const staticTerms = KNOWN_LICENSE_TERMS.find((t) => t.source_id === sourceId);
      if (staticTerms) {
        return {
          ...staticTerms,
          license_type: review.license_type,
          scraping_allowed: review.scraping_allowed,
          api_usage_allowed: review.api_usage_allowed,
          attribution_required: review.attribution_required,
          commercial_use_allowed: review.commercial_use_allowed,
          notes: review.notes ?? staticTerms.notes,
        };
      }
    }

    // Fall back to static registry
    return KNOWN_LICENSE_TERMS.find((t) => t.source_id === sourceId) ?? null;
  }

  /**
   * Get all documented license terms (for compliance dashboard).
   */
  getAllDocumentedTerms(): SourceLicenseTerms[] {
    return KNOWN_LICENSE_TERMS;
  }
}

// ── Validation ────────────────────────────────────────────────────────

/**
 * Validate a license review input.
 */
export function validateLicenseReview(input: LicenseReviewInput): string[] {
  const errors: string[] = [];

  if (!input.source_id || input.source_id.trim() === "") {
    errors.push("source_id must not be empty");
  }
  if (!input.reviewer_id || input.reviewer_id.trim() === "") {
    errors.push("reviewer_id must not be empty");
  }
  if (!input.license_type || !isValidLicenseType(input.license_type)) {
    errors.push(`license_type must be one of: ${VALID_LICENSE_TYPES.join(", ")}`);
  }

  // If license_type is 'pending', approved must be false
  if (input.license_type === "pending" && input.approved) {
    errors.push("Cannot approve a 'pending' license type");
  }

  // If license_type is 'restricted', notes should explain restrictions
  if (input.license_type === "restricted" && !input.notes) {
    errors.push("restricted license requires notes explaining the restrictions");
  }

  return errors;
}

const VALID_LICENSE_TYPES: LicenseType[] = [
  "public",
  "open",
  "commercial",
  "restricted",
  "pending",
];

function isValidLicenseType(s: string): s is LicenseType {
  return VALID_LICENSE_TYPES.includes(s as LicenseType);
}

// ── Compliance Check ──────────────────────────────────────────────────

/**
 * Check if a source can be used for the intended purpose.
 * This is the gate function called before any import or scraping.
 */
export async function checkSourceCompliance(
  registry: LicenseRegistryStore,
  sourceId: string,
  use: "scraping" | "api" | "commercial"
): Promise<{ allowed: boolean; reason: string; terms?: SourceLicenseTerms }> {
  const terms = await registry.getLicenseTerms(sourceId);
  if (!terms) {
    return {
      allowed: false,
      reason: `No license terms documented for source "${sourceId}"`,
    };
  }

  const hasValid = await registry.hasValidLicense(sourceId, use);
  if (!hasValid) {
    // Check static terms as fallback
    if (use === "scraping" && !terms.scraping_allowed) {
      return { allowed: false, reason: `Scraping not allowed for "${sourceId}"`, terms };
    }
    if (use === "api" && !terms.api_usage_allowed) {
      return { allowed: false, reason: `API usage not allowed for "${sourceId}"`, terms };
    }
    if (use === "commercial" && !terms.commercial_use_allowed) {
      return { allowed: false, reason: `Commercial use not allowed for "${sourceId}"`, terms };
    }
    return {
      allowed: false,
      reason: `No approved license review for "${sourceId}" — human approval required`,
      terms,
    };
  }

  return { allowed: true, reason: "License valid", terms };
}

// ── Row Mapper ────────────────────────────────────────────────────────

function rowToLicenseReview(row: Record<string, unknown>): LicenseReview {
  return {
    id: Number(row.id),
    source_id: row.source_id as string,
    reviewer_id: row.reviewer_id as string,
    reviewed_at: row.reviewed_at as string,
    license_type: row.license_type as LicenseType,
    terms_url: (row.terms_url as string) ?? null,
    scraping_allowed: row.scraping_allowed as boolean,
    api_usage_allowed: row.api_usage_allowed as boolean,
    attribution_required: row.attribution_required as boolean,
    commercial_use_allowed: row.commercial_use_allowed as boolean,
    notes: (row.notes as string) ?? null,
    approved: row.approved as boolean,
  };
}

// ── Hashing ───────────────────────────────────────────────────────────

/**
 * Compute a deterministic hash of license terms for audit trail.
 */
export function hashLicenseTerms(terms: SourceLicenseTerms): string {
  const stable = JSON.stringify({
    source_id: terms.source_id,
    license_type: terms.license_type,
    scraping_allowed: terms.scraping_allowed,
    api_usage_allowed: terms.api_usage_allowed,
    attribution_required: terms.attribution_required,
    commercial_use_allowed: terms.commercial_use_allowed,
  });
  return createHash("sha256").update(stable, "utf8").digest("hex");
}
