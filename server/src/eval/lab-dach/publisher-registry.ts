/**
 * LAB-DACH v3 — Publisher Partnership Integration (T10.4)
 *
 * Integrates commercial legal publishers (MANZ, C.H.BECK, Schulthess)
 * into the Source Lifecycle + License Registry framework.
 *
 * Features:
 *   - Publisher registry with partnership tiers and content catalogs
 *   - License review workflow for commercial content
 *   - Content import pipeline with DRM tracking
 *   - Attribution enforcement for licensed content
 *   - Citation provenance: published content is tracked separately
 *
 * Publishers:
 *   - MANZ (AT): Österreichische Rechtsliteratur, Kommentare
 *   - C.H.BECK (DE): Beck'sche Kommentare, NJW, ZPO
 *   - Schulthess (CH): Schweizer Rechtsliteratur, ZSR
 *   - Verlag Österreich (AT): Österreichische Gesetze, Kommentare
 *   - LexisNexis (DE/AT): Rechtsdatenbank, Kommentare
 */

import { createHash } from "node:crypto";
import type { LicenseType, SourceLicenseTerms } from "../../core/legal/license-registry.ts";

// ── Publisher Registry ────────────────────────────────────────────────

export type PublisherTier = "platinum" | "gold" | "silver" | "bronze" | "exploratory";

export interface PublisherEntry {
  id: string;
  name: string;
  jurisdiction: "DE" | "AT" | "CH" | "MULTI";
  tier: PublisherTier;
  partnership_started: string | null;
  contact_email: string | null;
  contact_name: string | null;
  api_endpoint: string | null;
  api_key_env_var: string | null;
  content_catalog: PublisherContentCatalog[];
  license_type: LicenseType;
  attribution_required: boolean;
  commercial_use_allowed: boolean;
  drm_protected: boolean;
  notes: string;
}

export interface PublisherContentCatalog {
  content_type:
    | "commentary"
    | "journal"
    | "textbook"
    | "case_law_annotated"
    | "encyclopedia"
    | "form_book";
  title: string;
  coverage: string;
  last_updated: string | null;
  article_count: number | null;
  available_via_api: boolean;
  available_via_scraping: boolean;
  notes: string;
}

// ── Known Publishers ──────────────────────────────────────────────────

export const KNOWN_PUBLISHERS: PublisherEntry[] = [
  {
    id: "publisher-manz",
    name: "MANZ'sche Verlags- und Universitätsbuchhandlung",
    jurisdiction: "AT",
    tier: "exploratory",
    partnership_started: null,
    contact_email: null,
    contact_name: null,
    api_endpoint: null,
    api_key_env_var: null,
    content_catalog: [
      {
        content_type: "commentary",
        title: " Kommentar zur ZPO",
        coverage: "Zivilprozessordnung Österreich",
        last_updated: null,
        article_count: null,
        available_via_api: false,
        available_via_scraping: false,
        notes: "Print + online. Partnership required for API access.",
      },
      {
        content_type: "commentary",
        title: "Kommentar zum ABGB",
        coverage: "Allgemeines bürgerliches Gesetzbuch Österreich",
        last_updated: null,
        article_count: null,
        available_via_api: false,
        available_via_scraping: false,
        notes: "Print + online. Partnership required for API access.",
      },
    ],
    license_type: "commercial",
    attribution_required: true,
    commercial_use_allowed: true,
    drm_protected: true,
    notes:
      "Leading Austrian legal publisher. Partnership exploration phase. Content requires commercial license.",
  },
  {
    id: "publisher-ch-beck",
    name: "C.H.BECK Verlag",
    jurisdiction: "DE",
    tier: "exploratory",
    partnership_started: null,
    contact_email: null,
    contact_name: null,
    api_endpoint: "https://api.beck-online.de",
    api_key_env_var: "BECK_API_KEY",
    content_catalog: [
      {
        content_type: "commentary",
        title: "Beck'scher Online-Kommentar BGB",
        coverage: "Bürgerliches Gesetzbuch Deutschland",
        last_updated: null,
        article_count: null,
        available_via_api: true,
        available_via_scraping: false,
        notes: "API access requires partnership. Beck-Online API available.",
      },
      {
        content_type: "commentary",
        title: "Beck'scher Online-Kommentar StGB",
        coverage: "Strafgesetzbuch Deutschland",
        last_updated: null,
        article_count: null,
        available_via_api: true,
        available_via_scraping: false,
        notes: "API access requires partnership.",
      },
      {
        content_type: "journal",
        title: "Neue Juristische Wochenschrift (NJW)",
        coverage: "German legal journal",
        last_updated: null,
        article_count: null,
        available_via_api: true,
        available_via_scraping: false,
        notes: "Leading German legal journal. API access via Beck-Online.",
      },
    ],
    license_type: "commercial",
    attribution_required: true,
    commercial_use_allowed: true,
    drm_protected: true,
    notes:
      "Leading German legal publisher. Beck-Online API exists. Partnership required for content access.",
  },
  {
    id: "publisher-schulthess",
    name: "Schulthess Verlag",
    jurisdiction: "CH",
    tier: "exploratory",
    partnership_started: null,
    contact_email: null,
    contact_name: null,
    api_endpoint: null,
    api_key_env_var: null,
    content_catalog: [
      {
        content_type: "journal",
        title: "Schweizerische Zeitschrift für Recht (ZSR)",
        coverage: "Swiss legal journal",
        last_updated: null,
        article_count: null,
        available_via_api: false,
        available_via_scraping: false,
        notes: "Print + online. Partnership required.",
      },
      {
        content_type: "commentary",
        title: "Zürcher Kommentar zum OR",
        coverage: "Obligationenrecht Schweiz",
        last_updated: null,
        article_count: null,
        available_via_api: false,
        available_via_scraping: false,
        notes: "Print + online. Partnership required.",
      },
    ],
    license_type: "commercial",
    attribution_required: true,
    commercial_use_allowed: true,
    drm_protected: true,
    notes: "Leading Swiss legal publisher. Partnership exploration phase.",
  },
  {
    id: "publisher-verlag-oesterreich",
    name: "Verlag Österreich",
    jurisdiction: "AT",
    tier: "exploratory",
    partnership_started: null,
    contact_email: null,
    contact_name: null,
    api_endpoint: null,
    api_key_env_var: null,
    content_catalog: [
      {
        content_type: "commentary",
        title: "Kommentar zur Strafprozessordnung (StPO)",
        coverage: "Strafprozessordnung Österreich",
        last_updated: null,
        article_count: null,
        available_via_api: false,
        available_via_scraping: false,
        notes: "Print + online. Partnership required.",
      },
    ],
    license_type: "commercial",
    attribution_required: true,
    commercial_use_allowed: true,
    drm_protected: true,
    notes: "Austrian legal publisher. Partnership exploration phase.",
  },
  {
    id: "publisher-lexisnexis",
    name: "LexisNexis Deutschland / Österreich",
    jurisdiction: "MULTI",
    tier: "exploratory",
    partnership_started: null,
    contact_email: null,
    contact_name: null,
    api_endpoint: "https://api.lexisnexis.com",
    api_key_env_var: "LEXISNEXIS_API_KEY",
    content_catalog: [
      {
        content_type: "commentary",
        title: "Schriften zum Deutschen und Europäischen Zivil-, Handels- und Prozessrecht",
        coverage: "DE + EU civil law",
        last_updated: null,
        article_count: null,
        available_via_api: true,
        available_via_scraping: false,
        notes: "LexisNexis API available. Partnership required.",
      },
      {
        content_type: "encyclopedia",
        title: "LexisNexis Rechtslexikon",
        coverage: "DE + AT legal encyclopedia",
        last_updated: null,
        article_count: null,
        available_via_api: true,
        available_via_scraping: false,
        notes: "Online legal encyclopedia. API access via partnership.",
      },
    ],
    license_type: "commercial",
    attribution_required: true,
    commercial_use_allowed: true,
    drm_protected: true,
    notes: "Multi-jurisdiction publisher. API exists. Partnership required.",
  },
];

// ── Publisher License Terms (for License Registry integration) ────────

export function publisherToLicenseTerms(publisher: PublisherEntry): SourceLicenseTerms {
  const termsUrlMap: Record<string, string> = {
    "publisher-manz": "https://www.manz.at/agb",
    "publisher-ch-beck": "https://www.beck.de/agb",
    "publisher-schulthess": "https://www.schulthess.com/agb",
    "publisher-verlag-oesterreich": "https://www.verlagoesterreich.at/agb",
    "publisher-lexisnexis": "https://www.lexisnexis.com/terms",
  };

  const urlMap: Record<string, string> = {
    "publisher-manz": "https://www.manz.at/",
    "publisher-ch-beck": "https://www.beck.de/",
    "publisher-schulthess": "https://www.schulthess.com/",
    "publisher-verlag-oesterreich": "https://www.verlagoesterreich.at/",
    "publisher-lexisnexis": "https://www.lexisnexis.com/",
  };

  return {
    source_id: publisher.id,
    source_name: publisher.name,
    jurisdiction: publisher.jurisdiction,
    official_url: urlMap[publisher.id] ?? "",
    license_type: publisher.license_type,
    terms_url: termsUrlMap[publisher.id] ?? "",
    scraping_allowed: false,
    api_usage_allowed: publisher.api_endpoint !== null,
    attribution_required: publisher.attribution_required,
    commercial_use_allowed: publisher.commercial_use_allowed,
    notes: publisher.notes,
  };
}

// ── Publisher Content Import ──────────────────────────────────────────

export interface PublisherContentImport {
  import_id: string;
  publisher_id: string;
  content_type: PublisherContentCatalog["content_type"];
  title: string;
  source_url: string;
  content_hash: string;
  attribution_text: string;
  imported_at: string;
  article_count: number;
  license_terms_hash: string;
  drm_tracked: boolean;
}

export function createPublisherContentImport(opts: {
  publisher_id: string;
  content_type: PublisherContentCatalog["content_type"];
  title: string;
  source_url: string;
  content: string;
  article_count: number;
}): PublisherContentImport {
  const publisher = KNOWN_PUBLISHERS.find((p) => p.id === opts.publisher_id);
  if (!publisher) {
    throw new Error(`Unknown publisher: ${opts.publisher_id}`);
  }

  const contentHash = createHash("sha256").update(opts.content, "utf8").digest("hex");
  const licenseTerms = publisherToLicenseTerms(publisher);
  const licenseHash = createHash("sha256")
    .update(
      JSON.stringify({
        source_id: licenseTerms.source_id,
        license_type: licenseTerms.license_type,
        attribution_required: licenseTerms.attribution_required,
        commercial_use_allowed: licenseTerms.commercial_use_allowed,
      }),
      "utf8"
    )
    .digest("hex");

  const attributionText = publisher.attribution_required
    ? `© ${publisher.name}. Alle Rechte vorbehalten. Verwendung unter Lizenz.`
    : "";

  return {
    import_id: `import-${opts.publisher_id}-${Date.now()}`,
    publisher_id: opts.publisher_id,
    content_type: opts.content_type,
    title: opts.title,
    source_url: opts.source_url,
    content_hash: contentHash,
    attribution_text: attributionText,
    imported_at: new Date().toISOString(),
    article_count: opts.article_count,
    license_terms_hash: licenseHash,
    drm_tracked: publisher.drm_protected,
  };
}

// ── Partnership Workflow ──────────────────────────────────────────────

export type PartnershipPhase =
  | "identified"
  | "initial_contact"
  | "negotiation"
  | "term_sheet"
  | "contract_signed"
  | "api_access_granted"
  | "content_imported"
  | "active"
  | "paused"
  | "terminated";

export interface PartnershipWorkflow {
  publisher_id: string;
  current_phase: PartnershipPhase;
  phase_history: { phase: PartnershipPhase; entered_at: string; notes: string }[];
  estimated_content_volume: number;
  estimated_monthly_cost_eur: number;
  technical_readiness: {
    api_available: boolean;
    api_key_configured: boolean;
    import_pipeline_ready: boolean;
    attribution_system_ready: boolean;
  };
}

export const PARTNERSHIP_PHASE_ORDER: PartnershipPhase[] = [
  "identified",
  "initial_contact",
  "negotiation",
  "term_sheet",
  "contract_signed",
  "api_access_granted",
  "content_imported",
  "active",
  "paused",
  "terminated",
];

export function createPartnershipWorkflow(publisherId: string): PartnershipWorkflow {
  const publisher = KNOWN_PUBLISHERS.find((p) => p.id === publisherId);
  if (!publisher) {
    throw new Error(`Unknown publisher: ${publisherId}`);
  }

  const now = new Date().toISOString();
  const apiKeyEnv = publisher.api_key_env_var;
  const apiKeyConfigured = apiKeyEnv ? !!process.env[apiKeyEnv] : false;

  return {
    publisher_id: publisherId,
    current_phase: "identified",
    phase_history: [
      {
        phase: "identified",
        entered_at: now,
        notes: "Publisher identified for potential partnership",
      },
    ],
    estimated_content_volume: publisher.content_catalog.length,
    estimated_monthly_cost_eur: 0,
    technical_readiness: {
      api_available: publisher.api_endpoint !== null,
      api_key_configured: apiKeyConfigured,
      import_pipeline_ready: false,
      attribution_system_ready: publisher.attribution_required,
    },
  };
}

export function advancePartnershipPhase(
  workflow: PartnershipWorkflow,
  toPhase: PartnershipPhase,
  notes: string
): PartnershipWorkflow {
  const currentIdx = PARTNERSHIP_PHASE_ORDER.indexOf(workflow.current_phase);
  const targetIdx = PARTNERSHIP_PHASE_ORDER.indexOf(toPhase);

  if (targetIdx < 0) {
    throw new Error(`Invalid phase: ${toPhase}`);
  }

  // Allow forward transitions and paused/terminated from any state
  if (targetIdx <= currentIdx && toPhase !== "paused" && toPhase !== "terminated") {
    throw new Error(`Cannot go backwards from ${workflow.current_phase} to ${toPhase}`);
  }

  const now = new Date().toISOString();
  return {
    ...workflow,
    current_phase: toPhase,
    phase_history: [...workflow.phase_history, { phase: toPhase, entered_at: now, notes }],
  };
}

// ── Attribution Enforcement ───────────────────────────────────────────

export interface AttributionCheckResult {
  passed: boolean;
  missing_attribution: string[];
  publisher_ids_checked: string[];
}

export function checkAttribution(
  outputText: string,
  importedContent: PublisherContentImport[]
): AttributionCheckResult {
  const missing: string[] = [];
  const checked = new Set<string>();

  for (const content of importedContent) {
    checked.add(content.publisher_id);
    if (content.attribution_text && !outputText.includes(content.attribution_text)) {
      missing.push(content.publisher_id);
    }
  }

  return {
    passed: missing.length === 0,
    missing_attribution: missing,
    publisher_ids_checked: [...checked],
  };
}

// ── Publisher Stats ───────────────────────────────────────────────────

export interface PublisherStats {
  total_publishers: number;
  by_tier: Record<PublisherTier, number>;
  by_jurisdiction: Record<string, number>;
  with_api_access: number;
  with_partnership: number;
  total_catalog_entries: number;
  estimated_total_articles: number;
}

export function computePublisherStats(): PublisherStats {
  const byTier: Record<string, number> = {};
  const byJurisdiction: Record<string, number> = {};
  let withApi = 0;
  let withPartnership = 0;
  let totalCatalog = 0;

  for (const publisher of KNOWN_PUBLISHERS) {
    byTier[publisher.tier] = (byTier[publisher.tier] ?? 0) + 1;
    byJurisdiction[publisher.jurisdiction] = (byJurisdiction[publisher.jurisdiction] ?? 0) + 1;
    if (publisher.api_endpoint) withApi++;
    if (publisher.partnership_started) withPartnership++;
    totalCatalog += publisher.content_catalog.length;
  }

  return {
    total_publishers: KNOWN_PUBLISHERS.length,
    by_tier: byTier as Record<PublisherTier, number>,
    by_jurisdiction: byJurisdiction,
    with_api_access: withApi,
    with_partnership: withPartnership,
    total_catalog_entries: totalCatalog,
    estimated_total_articles: 0,
  };
}
