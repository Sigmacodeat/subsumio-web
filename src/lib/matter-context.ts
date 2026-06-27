/**
 * Matter Context Engine — Kanzlei Superbrain Kern-Logik.
 *
 * Baut strukturierte Matter Context Bundles aus Engine-Pages,
 * Source Registry und CaseFrontmatter. Detektiert Lücken,
 * prüft Coverage und erklärt Retrieval-Ergebnisse.
 *
 * Architektur: Web-App ist thin client — diese Lib orchestriert
 * Engine-Calls und Source-Registry, ohne Engine-Interna zu kennen.
 */

import { buildSourceRegistry, type SourceRegistryEntry } from "@/lib/source-registry";
import {
  caseFrontmatter,
  type CaseFrontmatter,
  type DeadlineEntry,
  type DocumentEntry,
  type AuditLogEntry,
  type CommunicationEntry,
  type PermissionInfo,
} from "@/lib/legal-types";
import { inferInitialExtractionStatus } from "@/lib/extraction-status";
import { checkEthicalWall } from "@/lib/ethical-wall";
import { ForbiddenError } from "@/lib/errors";
import type {
  MatterContextBundle,
  MatterParty,
  MatterDeadlineSummary,
  MatterDocumentSummary,
  MatterActivityEntry,
  MatterFactEntry,
  MatterCommunicationEntry,
  MatterConversationEventSummary,
  MatterDocumentRequestSummary,
  MatterIntakeSummary,
  MatterPermissionSummary,
  MatterCoverageStatus,
  SourceCoverageEntry,
  MatterGap,
  GapType,
  GapSeverity,
  RetrievalExplanation,
  ExplainedSearchResult,
  BrainQualitySummary,
  QueryMode,
  MatterUnderstandingPanel,
  MatterRiskItem,
  RecentlyChangedSource,
} from "@/lib/matter-context-types";

// ── Types for Engine Responses ────────────────────────────────────────

interface EnginePageResponse {
  slug: string;
  title: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  source?: string;
  type?: string;
  word_count?: number;
}

interface EngineSearchResponse {
  results?: Array<{
    slug: string;
    title: string;
    snippet: string;
    score: number;
    source?: string;
    created_at?: string;
  }>;
}

interface EngineStatsResponse {
  total_pages: number;
  total_entities: number;
  total_edges: number;
  total_queries?: number;
  last_synced?: string;
  storage_used_mb?: number;
}

// ── Matter Context Bundle Builder ─────────────────────────────────────

/**
 * Hauptfunktion: Baut ein vollständiges Matter Context Bundle.
 * orchestriert Page-Fetch, Contact-Lookup, Coverage-Check und Gap-Detection.
 */
export async function buildMatterContext(
  caseSlug: string,
  engineUrl: string,
  engineHeaders: Record<string, string>,
  requestingUserId?: string
): Promise<MatterContextBundle> {
  const now = new Date().toISOString();
  const normalizedSlug = normalizeCaseSlug(caseSlug);

  // 1. Fetch case page from engine
  const casePage = await fetchEnginePage(engineUrl, engineHeaders, normalizedSlug);
  if (!casePage) {
    return emptyContext(normalizedSlug, caseSlug, now, false);
  }

  const fm = caseFrontmatter(casePage);
  const engineReachable = true;

  // Ethical Wall — checked immediately after frontmatter is available, before
  // any party/document/communication data is assembled, so a blocked lawyer
  // never receives case content even partially.
  if (requestingUserId) {
    const wallCheck = checkEthicalWall(requestingUserId, fm.permissions);
    if (!wallCheck.allowed) {
      throw new ForbiddenError("Access to this matter is blocked by an ethical wall.", {
        code: "ethical_wall_blocked",
        details: { case_slug: normalizedSlug },
      });
    }
  }

  // 2. Build parties from frontmatter + contact lookups
  const parties = await buildParties(engineUrl, engineHeaders, fm);

  // 3. Build deadline summaries
  const deadlines = buildDeadlineSummaries(fm.deadlines ?? []);

  // 4. Build document summaries — merge case.documents with case_slug-stamped pages
  const frontmatterDocs = buildDocumentSummaries(fm.documents ?? []);
  const slugStampedDocs = await fetchCaseDocumentsBySlug(engineUrl, engineHeaders, normalizedSlug);
  const documents = mergeDocuments(frontmatterDocs, slugStampedDocs);

  // 5. Build recent activity from audit log + timeline
  const recentActivity = buildRecentActivity(fm.audit_log ?? [], fm.timeline ?? []);

  // 6. Extract facts from frontmatter (strategy, evidence, claims)
  const facts = buildFacts(fm);

  // 7. Build communication summaries
  const communications = buildCommunications(fm.communications ?? []);

  // 8. Build WhatsApp/Kanzlei OS operational summaries
  const [documentRequests, intakeRequests, conversationEvents] = await Promise.all([
    buildDocumentRequestSummaries(engineUrl, engineHeaders, normalizedSlug),
    buildIntakeSummaries(engineUrl, engineHeaders, normalizedSlug),
    buildConversationEventSummaries(engineUrl, engineHeaders, normalizedSlug),
  ]);

  // 9. Build permission summary
  const permissions = buildPermissionSummary(fm.permissions);

  // 10. Check coverage
  const coverage = await checkCoverage(engineUrl, engineHeaders, fm, documents);

  // 11. Detect gaps
  const gaps = detectGaps(
    fm,
    parties,
    deadlines,
    documents,
    coverage,
    engineReachable,
    communications,
    permissions,
    documentRequests
  );

  return {
    case_slug: normalizedSlug,
    case_title: casePage.title,
    case_number: fm.case_number,
    legal_area: fm.legal_area,
    status: fm.status,
    parties,
    deadlines,
    documents,
    recent_activity: recentActivity,
    facts,
    communications,
    document_requests: documentRequests,
    intake_requests: intakeRequests,
    conversation_events: conversationEvents,
    permissions,
    coverage,
    gaps,
    generated_at: now,
    engine_reachable: engineReachable,
  };
}

// ── Coverage Check ────────────────────────────────────────────────────

export async function checkCoverage(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  caseFrontmatter?: CaseFrontmatter,
  matterDocuments?: MatterDocumentSummary[]
): Promise<MatterCoverageStatus> {
  const warnings: string[] = [];
  const sources: SourceCoverageEntry[] = [];

  // 1. Source Registry entries
  let registryEntries: SourceRegistryEntry[] = [];
  try {
    const registry = await buildSourceRegistry(undefined);
    registryEntries = registry.sources;
  } catch {
    warnings.push("Source Registry nicht ladbar");
  }

  for (const entry of registryEntries) {
    sources.push({
      source_id: entry.id,
      source_label: entry.label,
      source_type:
        entry.type === "statute_corpus"
          ? "statute_corpus"
          : entry.type === "judgement_api"
            ? "judgement_api"
            : "regulatory_feed",
      connected: entry.enabled,
      last_sync_at: entry.last_sync_at,
      document_count: entry.document_count,
      index_fresh: entry.status === "fresh",
      ocr_complete: entry.type === "statute_corpus", // statutes don't need OCR
      error: entry.last_error,
    });
  }

  // 2. DMS sources (check connectors)
  const dmsSources = await checkDmsSources(engineUrl, engineHeaders);
  sources.push(...dmsSources);

  // 3. Email/WhatsApp/Portal (check from case frontmatter)
  const communicationSources = checkCommunicationSources(caseFrontmatter);
  sources.push(...communicationSources);

  // 4. Upload source. Do not mark this as fully fresh/OCR-complete unless
  // the matter's actual document statuses support that claim.
  const uploadDocuments =
    matterDocuments ?? buildDocumentSummaries(caseFrontmatter?.documents ?? []);
  const uploadHealth = summarizeUploadHealth(uploadDocuments);
  sources.push({
    source_id: "upload",
    source_label: "Datei-Upload",
    source_type: "upload",
    connected: true,
    last_sync_at: null,
    document_count: uploadDocuments.length,
    index_fresh: uploadHealth.indexFresh,
    ocr_complete: uploadHealth.ocrComplete,
    error: uploadHealth.error,
  });

  // Calculate aggregates
  const total = sources.length;
  const connected = sources.filter((s) => s.connected).length;
  const fresh = sources.filter((s) => s.index_fresh).length;
  const stale = sources.filter((s) => !s.index_fresh && s.connected).length;
  const errors = sources.filter((s) => s.error).length;
  const ocrPending = sources.filter((s) => s.connected && !s.ocr_complete).length;

  const completenessScore = calculateCompletenessScore(sources);

  if (ocrPending > 0) {
    warnings.push(`${ocrPending} Quelle(n) mit ausstehender OCR/Indexierung`);
  }
  if (stale > 0) {
    warnings.push(`${stale} Quelle(n) mit veraltetem Index`);
  }
  if (connected < total) {
    warnings.push(`${total - connected} Quelle(n) nicht verbunden`);
  }

  const overallFreshness: MatterCoverageStatus["overall_freshness"] =
    fresh >= connected * 0.8 ? "fresh" : stale > 0 ? "stale" : "unknown";

  return {
    sources,
    total_sources: total,
    connected_sources: connected,
    fresh_sources: fresh,
    stale_sources: stale,
    error_sources: errors,
    ocr_pending: ocrPending,
    overall_freshness: overallFreshness,
    completeness_score: completenessScore,
    warnings,
  };
}

// ── Gap Detection ─────────────────────────────────────────────────────

export function detectGaps(
  fm: CaseFrontmatter,
  parties: MatterParty[],
  deadlines: MatterDeadlineSummary[],
  documents: MatterDocumentSummary[],
  coverage: MatterCoverageStatus,
  engineReachable: boolean,
  communications: MatterCommunicationEntry[] = [],
  permissions: MatterPermissionSummary | null = null,
  documentRequests: MatterDocumentRequestSummary[] = []
): MatterGap[] {
  const gaps: MatterGap[] = [];
  const now = new Date();

  if (!engineReachable) {
    gaps.push(
      makeGap(
        "engine_unreachable",
        "critical",
        "Engine nicht erreichbar",
        "Die Subsumio Engine ist nicht erreichbar. Matter Context kann unvollständig sein.",
        "Engine-Verbindung prüfen und neu starten.",
        now
      )
    );
  }

  // Missing client
  const hasClient = parties.some((p) => p.role === "client");
  if (!hasClient) {
    gaps.push(
      makeGap(
        "missing_client_info",
        "high",
        "Kein Mandant zugeordnet",
        "Diese Akte hat keinen zugeordneten Mandanten. Eine Mandantenzuordnung ist für weitere Bearbeitung erforderlich.",
        "Mandant aus Kontakten zuordnen oder neuen Kontakt anlegen.",
        now
      )
    );
  }

  // Missing opponent
  const hasOpponent = parties.some((p) => p.role === "opponent");
  if (!hasOpponent && fm.status && fm.status !== "closed" && fm.status !== "settled") {
    gaps.push(
      makeGap(
        "unclear_opponent",
        "medium",
        "Gegenseite unklar",
        "Keine Gegenseite in dieser Akte erfasst. Bei streitigen Verfahren sollte die Gegenseite dokumentiert sein.",
        "Gegner aus Kontakten zuordnen oder als 'unbekannt' markieren.",
        now
      )
    );
  }

  // Missing power of attorney
  const hasVollmacht = documents.some(
    (d) =>
      d.name.toLowerCase().includes("vollmacht") ||
      d.name.toLowerCase().includes("power of attorney")
  );
  if (!hasVollmacht && hasClient) {
    gaps.push(
      makeGap(
        "missing_power_of_attorney",
        "high",
        "Vollmacht fehlt",
        "Keine Vollmacht in den Aktendokumenten gefunden. Für gerichtliches Handeln ist eine Vollmacht erforderlich.",
        "Vollmacht hochladen oder deren Vorliegen bestätigen.",
        now
      )
    );
  }

  for (const request of documentRequests) {
    if (request.status === "fulfilled" || request.status === "expired") continue;
    for (const item of request.open_items.filter((openItem) => openItem.required)) {
      gaps.push(
        makeGap(
          "missing_document",
          "high",
          `Angeforderte Unterlage fehlt: ${item.label}`,
          `Die Dokumentenanfrage ${request.slug} ist ${request.status}; die Pflichtunterlage "${item.label}" wurde noch nicht eingereicht.`,
          "Mandant an die offene Unterlage erinnern oder Dokument im Portal hochladen lassen.",
          now,
          request.slug
        )
      );
    }
  }

  // Overdue deadlines
  for (const deadline of deadlines) {
    if (deadline.urgency === "overdue") {
      gaps.push(
        makeGap(
          "missing_deadline",
          "critical",
          `Frist überschritten: ${deadline.title}`,
          `Die Frist "${deadline.title}" (Datum: ${deadline.date}) ist überschritten.`,
          "Frist sofort prüfen und Maßnahmen einleiten.",
          now,
          deadline.title
        )
      );
    }
  }

  // Unreviewed documents — check both legacy ocr_status and new extraction_status
  const unreviewed = documents.filter(
    (d) =>
      d.ocr_status === "ocr_needed" ||
      d.ocr_status === "unknown" ||
      d.extraction_status === "ocr_needed" ||
      d.extraction_status === "ocr_failed" ||
      d.extraction_status === "uploaded" ||
      d.extraction_status === "processing" ||
      d.extraction_status === "ocr_processing"
  );
  if (unreviewed.length > 0) {
    gaps.push(
      makeGap(
        "unreviewed_document",
        "medium",
        `${unreviewed.length} ungeprüfte(s) Dokument(e)`,
        `${unreviewed.length} Dokument(e) ohne bestätigten Text-Layer oder OCR-Status. Diese könnten unvollständig indexiert sein.`,
        "OCR-Status prüfen und ggf. Re-OCR anstoßen.",
        now
      )
    );
  }

  // Contradictory facts
  const contradictions = detectContradictions(fm);
  for (const contradiction of contradictions) {
    gaps.push(contradiction);
  }

  // Incomplete coverage
  if (coverage.completeness_score < 0.5) {
    gaps.push(
      makeGap(
        "incomplete_coverage",
        "medium",
        "Unvollständige Quellenabdeckung",
        `Nur ${Math.round(coverage.completeness_score * 100)}% der Quellen sind verbunden und aktuell. Der Matter Context kann unvollständig sein.`,
        "Fehlende Quellen anbinden und Sync-Status prüfen.",
        now
      )
    );
  }

  // Missing deadline confirmation
  const hasCourtDeadline = deadlines.some((d) => d.court);
  const hasConfirmation = documents.some(
    (d) =>
      d.name.toLowerCase().includes("bestätigung") || d.name.toLowerCase().includes("confirmation")
  );
  if (hasCourtDeadline && !hasConfirmation) {
    gaps.push(
      makeGap(
        "missing_deadline_confirmation",
        "low",
        "Fristbestätigung fehlt",
        "Gerichtliche Fristen sind erfasst, aber keine Fristbestätigung als Dokument hinterlegt.",
        "Fristbestätigung des Gerichts hochladen, falls vorhanden.",
        now
      )
    );
  }

  // Missing communication log for open cases
  if (
    communications.length === 0 &&
    fm.status &&
    fm.status !== "closed" &&
    fm.status !== "settled"
  ) {
    gaps.push(
      makeGap(
        "missing_communication_log",
        "low",
        "Keine Kommunikation dokumentiert",
        "Für diese offene Akte sind keine Kommunikationsvorgänge (E-Mail, WhatsApp, Telefon) erfasst.",
        "Kommunikation aus E-Mail/WhatsApp-Integration importieren oder manuell dokumentieren.",
        now
      )
    );
  }

  // Unprivileged communication detected
  const unprivileged = communications.filter((c) => !c.privileged && c.channel !== "phone");
  if (unprivileged.length > 0 && permissions?.privileged) {
    gaps.push(
      makeGap(
        "unprivileged_communication",
        "medium",
        "Unprivilegierte Kommunikation in privilegierter Akte",
        `${unprivileged.length} Kommunikation(n) in einer als privilegiert markierten Akte sind nicht als privilegiert gekennzeichnet.`,
        "Privilegien-Status der Kommunikation prüfen und ggf. nachtragen.",
        now
      )
    );
  }

  // Ethical wall violation — blocked users in allowed_users
  if (permissions && permissions.blocked_users.length > 0) {
    const overlap = permissions.allowed_users.filter((u) => permissions.blocked_users.includes(u));
    if (overlap.length > 0) {
      gaps.push(
        makeGap(
          "ethical_wall_violation",
          "critical",
          "Ethical Wall Verletzung",
          `${overlap.length} Benutzer sind gleichzeitig in allowed_users und blocked_users. Dies verletzt den Ethical Wall.`,
          "Berechtigungen sofort korrigieren — betroffene Benutzer aus allowed_users entfernen.",
          now
        )
      );
    }
  }

  return gaps;
}

// ── Retrieval Explainability ──────────────────────────────────────────

export async function explainRetrieval(
  query: string,
  engineUrl: string,
  engineHeaders: Record<string, string>,
  mode: QueryMode = "balanced"
): Promise<ExplainedSearchResult[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: "10",
    });
    if (mode === "conservative") {
      params.set("type", "statute");
    }

    const res = await fetch(`${engineUrl}/api/search?${params.toString()}`, {
      headers: engineHeaders,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as EngineSearchResponse;
    const results = data.results ?? [];

    return results.map((r) => {
      const explanation: RetrievalExplanation = {
        slug: r.slug,
        title: r.title,
        score: r.score,
        search_mode: inferSearchMode(r.score, r.snippet),
        source: r.source ?? "internal",
        source_type: inferSourceType(r.slug),
        recency_hours: r.created_at ? calculateRecencyHours(r.created_at) : undefined,
        permission_filtered: false,
        chunk_info: {
          snippet: r.snippet,
        },
      };

      return {
        slug: r.slug,
        title: r.title,
        snippet: r.snippet,
        score: r.score,
        explanation,
      };
    });
  } catch {
    return [];
  }
}

// ── Brain Quality Summary ─────────────────────────────────────────────

export async function buildBrainQualitySummary(
  engineUrl: string,
  engineHeaders: Record<string, string>
): Promise<BrainQualitySummary> {
  let stats: EngineStatsResponse = {
    total_pages: 0,
    total_entities: 0,
    total_edges: 0,
  };

  try {
    const res = await fetch(`${engineUrl}/api/stats`, {
      headers: engineHeaders,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      stats = (await res.json()) as EngineStatsResponse;
    }
  } catch {
    // Engine unreachable
  }

  // Source registry for coverage
  let registryEntries: SourceRegistryEntry[] = [];
  let coverageScore = 0;
  let staleSources = 0;
  const sourceBreakdown: BrainQualitySummary["source_breakdown"] = [];

  try {
    const registry = await buildSourceRegistry(undefined);
    registryEntries = registry.sources;
    staleSources = registry.stale + registry.error;
    coverageScore = registry.total > 0 ? registry.fresh / registry.total : 0;

    const byType = new Map<string, { count: number; fresh: boolean }>();
    for (const entry of registryEntries) {
      const existing = byType.get(entry.type) ?? { count: 0, fresh: false };
      existing.count += 1;
      if (entry.status === "fresh") existing.fresh = true;
      byType.set(entry.type, existing);
    }
    for (const [type, info] of byType) {
      sourceBreakdown.push({ source_type: type, count: info.count, fresh: info.fresh });
    }
  } catch {
    // Registry not available
  }

  const qualityIssues: string[] = [];
  if (staleSources > 0) qualityIssues.push(`${staleSources} veraltete Quellen`);
  if (coverageScore < 0.5) qualityIssues.push("Niedrige Quellenabdeckung");
  if (stats.total_pages === 0) qualityIssues.push("Brain ist leer");

  return {
    total_pages: stats.total_pages,
    total_entities: stats.total_entities,
    total_edges: stats.total_edges,
    indexed_pages: stats.total_pages,
    ocr_pending: 0,
    stale_sources: staleSources,
    coverage_score: coverageScore,
    last_synced: stats.last_synced ?? null,
    source_breakdown: sourceBreakdown,
    quality_issues: qualityIssues,
  };
}

// ── Helper Functions ──────────────────────────────────────────────────

export function normalizeCaseSlug(slug: string): string {
  return slug.replace(/^\/+|\/+$/g, "").replace(/%2F/gi, "/");
}

async function fetchEnginePage(
  engineUrl: string,
  headers: Record<string, string>,
  slug: string
): Promise<EnginePageResponse | null> {
  try {
    const encodedSlug = slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${engineUrl}/api/pages/${encodedSlug}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as EnginePageResponse;
  } catch {
    return null;
  }
}

async function fetchEnginePagesByType(
  engineUrl: string,
  headers: Record<string, string>,
  type: string,
  limit = 200
): Promise<EnginePageResponse[]> {
  try {
    const params = new URLSearchParams({ type, limit: String(limit) });
    const res = await fetch(`${engineUrl}/api/pages?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data as EnginePageResponse[];
    if (Array.isArray(data?.pages)) return data.pages as EnginePageResponse[];
    if (Array.isArray(data?.items)) return data.items as EnginePageResponse[];
    return [];
  } catch {
    return [];
  }
}

/**
 * Fetch all document pages from the engine that have `case_slug` set to the
 * given case slug in their frontmatter. This is the canonical source of truth —
 * documents uploaded to a case get `case_slug` stamped on the document page itself.
 * The case frontmatter `documents` array is a secondary, user-curated list that
 * can drift. This function ensures we always see every document that belongs
 * to the case, even if the array is out of sync.
 */
async function fetchCaseDocumentsBySlug(
  engineUrl: string,
  headers: Record<string, string>,
  caseSlug: string
): Promise<MatterDocumentSummary[]> {
  try {
    const pages = await fetchEnginePagesByType(engineUrl, headers, "document", 200);
    const matched = pages.filter((p) => {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      return (
        fm.case_slug === caseSlug &&
        fm.assignment_status !== "unassigned" &&
        fm.status !== "tombstoned"
      );
    });
    return matched.map((p) => {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      return {
        slug: p.slug,
        name: p.title ?? p.slug,
        kind: typeof fm.document_type === "string" ? fm.document_type : undefined,
        uploaded_at: p.updated_at ?? p.created_at ?? new Date().toISOString(),
        size: typeof fm.bytes === "number" ? fm.bytes : undefined,
        source: typeof fm.source_format === "string" ? fm.source_format : "upload",
        ocr_status: inferOcrStatusFromFrontmatter(fm),
        extraction_status: inferExtractionStatusFromFrontmatter(fm),
        analysis_status:
          typeof fm.analysis_status === "string"
            ? (fm.analysis_status as MatterDocumentSummary["analysis_status"])
            : undefined,
      };
    });
  } catch {
    return [];
  }
}

function inferOcrStatusFromFrontmatter(
  fm: Record<string, unknown>
): MatterDocumentSummary["ocr_status"] {
  const method = fm.extraction_method;
  if (method === "ocr_vision" || fm.extraction_unverified === "true") return "ocr_complete";
  if (method === "text_layer") return "text_layer";
  return "unknown";
}

function inferExtractionStatusFromFrontmatter(
  fm: Record<string, unknown>
): MatterDocumentSummary["extraction_status"] {
  const method = typeof fm.extraction_method === "string" ? fm.extraction_method : "";
  if (method === "text_layer" || method === "docx" || method === "eml") return "text_layer";
  if (method === "ocr_vision") return "ocr_complete";
  return "processing";
}

/**
 * Merge documents from the case frontmatter array with documents discovered
 * via case_slug frontmatter on document pages. De-duplicates by slug.
 * Frontmatter entries take precedence for kind/name (user-curated), but
 * slug-stamped entries fill in any gaps.
 */
function mergeDocuments(
  frontmatterDocs: MatterDocumentSummary[],
  slugStampedDocs: MatterDocumentSummary[]
): MatterDocumentSummary[] {
  const bySlug = new Map<string, MatterDocumentSummary>();
  for (const doc of slugStampedDocs) {
    bySlug.set(doc.slug, doc);
  }
  for (const doc of frontmatterDocs) {
    const existing = bySlug.get(doc.slug);
    if (existing) {
      bySlug.set(doc.slug, {
        ...existing,
        ...doc,
        kind: doc.kind ?? existing.kind,
        name: doc.name ?? existing.name,
      });
    } else {
      bySlug.set(doc.slug, doc);
    }
  }
  return Array.from(bySlug.values()).sort(
    (a, b) => new Date(b.uploaded_at ?? 0).getTime() - new Date(a.uploaded_at ?? 0).getTime()
  );
}

async function buildParties(
  engineUrl: string,
  headers: Record<string, string>,
  fm: CaseFrontmatter
): Promise<MatterParty[]> {
  const parties: MatterParty[] = [];

  // Client
  if (fm.client_slug || fm.client_name) {
    const contact = fm.client_slug ? await fetchContact(engineUrl, headers, fm.client_slug) : null;
    parties.push({
      slug: fm.client_slug ?? `client-${fm.client_name ?? "unknown"}`,
      name: contact?.name ?? fm.client_name ?? "Unbekannt",
      role: "client",
      contact_info: contact
        ? {
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            address: contact.address,
          }
        : undefined,
    });
  }

  // Opponents
  const opponentSlugs = fm.opponent_slugs ?? [];
  const opponentNames = fm.opponent_name ? [fm.opponent_name] : [];
  for (let i = 0; i < Math.max(opponentSlugs.length, opponentNames.length); i++) {
    const slug = opponentSlugs[i];
    const contact = slug ? await fetchContact(engineUrl, headers, slug) : null;
    parties.push({
      slug: slug ?? `opponent-${i}`,
      name: contact?.name ?? opponentNames[i] ?? "Unbekannt",
      role: "opponent",
      contact_info: contact
        ? {
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            address: contact.address,
          }
        : undefined,
    });
  }

  // Own lawyer
  if (fm.own_lawyer_slug || fm.own_lawyer_name) {
    const contact = fm.own_lawyer_slug
      ? await fetchContact(engineUrl, headers, fm.own_lawyer_slug)
      : null;
    parties.push({
      slug: fm.own_lawyer_slug ?? `lawyer-${fm.own_lawyer_name ?? "unknown"}`,
      name: contact?.name ?? fm.own_lawyer_name ?? "Unbekannt",
      role: "lawyer",
      contact_info: contact
        ? {
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            address: contact.address,
          }
        : undefined,
    });
  }

  // Court
  if (fm.court_slug || fm.court_name) {
    const contact = fm.court_slug ? await fetchContact(engineUrl, headers, fm.court_slug) : null;
    parties.push({
      slug: fm.court_slug ?? `court-${fm.court_name ?? "unknown"}`,
      name: contact?.name ?? fm.court_name ?? "Unbekannt",
      role: "court",
      contact_info: contact
        ? {
            email: contact.email,
            phone: contact.phone,
            company: contact.company,
            address: contact.address,
          }
        : undefined,
    });
  }

  return parties;
}

async function fetchContact(
  engineUrl: string,
  headers: Record<string, string>,
  slug: string
): Promise<{
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
} | null> {
  try {
    const encodedSlug = slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${engineUrl}/api/pages/${encodedSlug}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const page = (await res.json()) as EnginePageResponse;
    const fm = (page.frontmatter ?? {}) as Record<string, string | undefined>;
    return {
      name: fm.name ?? page.title,
      email: fm.email,
      phone: fm.phone,
      company: fm.company,
      address: fm.address,
    };
  } catch {
    return null;
  }
}

export function buildDeadlineSummaries(deadlines: DeadlineEntry[]): MatterDeadlineSummary[] {
  const now = new Date();
  return deadlines
    .filter((d) => d.date || d.due_date)
    .map((d) => {
      const dateStr = d.due_date ?? d.date ?? "";
      const date = new Date(dateStr);
      const diffMs = date.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      let urgency: MatterDeadlineSummary["urgency"] = "normal";
      if (d.status === "done" || d.status === "completed") {
        urgency = "done";
      } else if (diffDays < 0) {
        urgency = "overdue";
      } else if (diffDays <= 3) {
        urgency = "critical";
      } else if (diffDays <= 14) {
        urgency = "upcoming";
      }

      return {
        id: d.id,
        title: d.title ?? d.description ?? "Unbenannte Frist",
        date: dateStr,
        status: d.status ?? "open",
        urgency,
        source: d.source ?? "manual",
        court: d.court,
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function buildDocumentSummaries(documents: DocumentEntry[]): MatterDocumentSummary[] {
  return documents.map((d) => ({
    slug: d.slug ?? d.id,
    name: d.name,
    kind: d.kind,
    uploaded_at: d.uploadedAt,
    size: d.size,
    source: d.source,
    ocr_status: inferOcrStatus(d),
    extraction_status: inferInitialExtractionStatus(d.name, d.kind ?? ""),
  }));
}

export function summarizeUploadHealth(documents: MatterDocumentSummary[]): {
  indexFresh: boolean;
  ocrComplete: boolean;
  error?: string;
} {
  if (documents.length === 0) {
    return { indexFresh: true, ocrComplete: true };
  }

  const pendingIndex = documents.filter((doc) =>
    ["uploaded", "processing", "ocr_needed", "ocr_processing"].includes(doc.extraction_status ?? "")
  );
  const failed = documents.filter((doc) =>
    ["error", "ocr_failed"].includes(doc.extraction_status ?? "")
  );
  const ocrIncomplete = documents.filter((doc) => {
    if (
      doc.extraction_status &&
      ["ready", "text_layer", "ocr_complete"].includes(doc.extraction_status)
    ) {
      return false;
    }
    return doc.ocr_status === "unknown" || doc.ocr_status === "ocr_needed";
  });

  return {
    indexFresh: pendingIndex.length === 0 && failed.length === 0,
    ocrComplete: ocrIncomplete.length === 0,
    ...(failed.length > 0
      ? { error: `${failed.length} Upload-Dokument(e) mit fehlgeschlagener Extraktion/OCR` }
      : {}),
  };
}

export async function buildDocumentRequestSummaries(
  engineUrl: string,
  headers: Record<string, string>,
  caseSlug: string
): Promise<MatterDocumentRequestSummary[]> {
  const pages = await fetchEnginePagesByType(engineUrl, headers, "document_request", 200);
  return pages
    .map((page): MatterDocumentRequestSummary | null => {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      const items = Array.isArray(fm.items) ? (fm.items as Array<Record<string, unknown>>) : [];
      if (fm.type !== "document_request" || fm.case_slug !== caseSlug) return null;
      const summary: MatterDocumentRequestSummary = {
        slug: page.slug,
        status: asString(fm.status, "draft") as MatterDocumentRequestSummary["status"],
        channel: asString(fm.channel, "manual") as MatterDocumentRequestSummary["channel"],
        created_at: asString(fm.created_at, page.created_at ?? new Date(0).toISOString()),
        updated_at: asString(
          fm.updated_at,
          page.updated_at ?? page.created_at ?? new Date(0).toISOString()
        ),
        open_items: items
          .filter((item) => !optionalString(item.received_document_slug))
          .map((item) => ({
            key: asString(item.key, "unterlage"),
            label: asString(item.label, asString(item.key, "Unterlage")),
            required: item.required !== false,
          })),
        fulfilled_items: items
          .filter((item) => optionalString(item.received_document_slug))
          .map((item) => ({
            key: asString(item.key, "unterlage"),
            label: asString(item.label, asString(item.key, "Unterlage")),
            document_slug: optionalString(item.received_document_slug) ?? "",
          })),
      };
      const sentAt = optionalString(fm.sent_at);
      const portalUrl = optionalString(fm.portal_url);
      if (sentAt) summary.sent_at = sentAt;
      if (portalUrl) summary.portal_url = portalUrl;
      return summary;
    })
    .filter((item): item is MatterDocumentRequestSummary => item !== null)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function buildIntakeSummaries(
  engineUrl: string,
  headers: Record<string, string>,
  caseSlug: string
): Promise<MatterIntakeSummary[]> {
  const pages = await fetchEnginePagesByType(engineUrl, headers, "intake_request", 200);
  return pages
    .map((page): MatterIntakeSummary | null => {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      if (fm.type !== "intake_request" || fm.converted_case_slug !== caseSlug) return null;
      const missing = Array.isArray(fm.missing_documents)
        ? fm.missing_documents.filter((item): item is string => typeof item === "string")
        : [];
      const summary: MatterIntakeSummary = {
        slug: page.slug,
        status: asString(fm.status, "new") as MatterIntakeSummary["status"],
        source: asString(fm.source, "manual") as MatterIntakeSummary["source"],
        summary: asString(fm.summary, page.content ?? page.title),
        conflict_check_status: asString(
          fm.conflict_check_status,
          "pending"
        ) as MatterIntakeSummary["conflict_check_status"],
        missing_documents: missing,
        created_at: asString(fm.created_at, page.created_at ?? new Date(0).toISOString()),
        updated_at: asString(
          fm.updated_at,
          page.updated_at ?? page.created_at ?? new Date(0).toISOString()
        ),
      };
      const clientName = optionalString(fm.client_name);
      const legalArea = optionalString(fm.legal_area);
      const convertedCaseSlug = optionalString(fm.converted_case_slug);
      if (clientName) summary.client_name = clientName;
      if (legalArea) summary.legal_area = legalArea;
      if (convertedCaseSlug) summary.converted_case_slug = convertedCaseSlug;
      return summary;
    })
    .filter((item): item is MatterIntakeSummary => item !== null)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function buildConversationEventSummaries(
  engineUrl: string,
  headers: Record<string, string>,
  caseSlug: string
): Promise<MatterConversationEventSummary[]> {
  const pages = await fetchEnginePagesByType(engineUrl, headers, "conversation_event", 200);
  return pages
    .map((page): MatterConversationEventSummary | null => {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      if (fm.type !== "conversation_event" || fm.case_slug !== caseSlug) return null;
      const summary: MatterConversationEventSummary = {
        slug: page.slug,
        channel: asString(fm.channel, "other") as MatterConversationEventSummary["channel"],
        direction: asString(fm.direction, "inbound") as MatterConversationEventSummary["direction"],
        created_at: asString(fm.created_at, page.created_at ?? new Date(0).toISOString()),
      };
      const role = optionalString(fm.role);
      const actorName = optionalString(fm.actor_name);
      const intent = optionalString(fm.intent);
      const riskLevel = optionalString(fm.risk_level);
      const status = optionalString(fm.status);
      const normalizedText = optionalString(fm.normalized_text);
      if (role) summary.role = role;
      if (actorName) summary.actor_name = actorName;
      if (intent) summary.intent = intent;
      if (riskLevel) summary.risk_level = riskLevel;
      if (status) summary.status = status;
      if (normalizedText) summary.normalized_text = normalizedText;
      return summary;
    })
    .filter((item): item is MatterConversationEventSummary => item !== null)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);
}

export function inferOcrStatus(doc: DocumentEntry): MatterDocumentSummary["ocr_status"] {
  const name = doc.name.toLowerCase();
  if (
    name.endsWith(".pdf") ||
    name.endsWith(".tif") ||
    name.endsWith(".tiff") ||
    name.endsWith(".jpg") ||
    name.endsWith(".png")
  ) {
    return "unknown";
  }
  if (
    name.endsWith(".docx") ||
    name.endsWith(".doc") ||
    name.endsWith(".txt") ||
    name.endsWith(".md")
  ) {
    return "text_layer";
  }
  return "not_applicable";
}

export function buildRecentActivity(
  auditLog: AuditLogEntry[],
  timeline: Array<{
    id?: string;
    date?: string;
    title?: string;
    description?: string;
    type?: string;
    status?: string;
  }>
): MatterActivityEntry[] {
  const activities: MatterActivityEntry[] = [];

  for (const entry of auditLog.slice(-20).reverse()) {
    activities.push({
      at: entry.at,
      action: entry.action,
      actor: entry.actor ?? entry.actorId,
      description: entry.note ?? `${entry.action} ${entry.field ?? ""}`.trim(),
      entity_type: "case",
    });
  }

  for (const entry of timeline.slice(-10).reverse()) {
    if (entry.date) {
      activities.push({
        at: entry.date,
        action: entry.type ?? "timeline",
        description: entry.title ?? entry.description ?? "",
        entity_type: "timeline",
      });
    }
  }

  // Sort by date descending
  activities.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return activities.slice(0, 30);
}

export function buildFacts(fm: CaseFrontmatter): MatterFactEntry[] {
  const facts: MatterFactEntry[] = [];
  const now = new Date().toISOString();

  if (fm.strategy?.summary) {
    facts.push({
      id: "strategy-summary",
      statement: fm.strategy.summary,
      source: "case_frontmatter",
      confidence: "medium",
      date: fm.strategy.generatedAt,
    });
  }

  if (fm.strategy?.recommended || fm.strategy?.recommendedApproach) {
    facts.push({
      id: "strategy-recommended",
      statement: fm.strategy.recommended ?? fm.strategy.recommendedApproach ?? "",
      source: "case_frontmatter",
      confidence: "medium",
      date: fm.strategy.generatedAt,
    });
  }

  for (const claim of fm.claims ?? []) {
    facts.push({
      id: `claim-${facts.length}`,
      statement: claim,
      source: "case_frontmatter.claims",
      confidence: "medium",
      date: now,
    });
  }

  for (const evidence of fm.evidence ?? []) {
    if (evidence.description) {
      facts.push({
        id: `evidence-${facts.length}`,
        statement: evidence.description,
        source: evidence.source ?? "case_frontmatter.evidence",
        confidence:
          evidence.weight !== undefined
            ? evidence.weight > 0.7
              ? "high"
              : evidence.weight > 0.3
                ? "medium"
                : "low"
            : "medium",
        date: now,
      });
    }
  }

  return facts;
}

export function detectContradictions(fm: CaseFrontmatter): MatterGap[] {
  const gaps: MatterGap[] = [];
  const now = new Date();

  // Check for contradictory claims vs defenses
  const claims = fm.claims ?? [];
  const defenses = fm.defenses ?? [];

  for (const claim of claims) {
    for (const defense of defenses) {
      if (areContradictory(claim, defense)) {
        gaps.push(
          makeGap(
            "contradictory_facts",
            "medium",
            "Widersprüchliche Aussagen",
            `Claim "${claim}" widerspricht Verteidigung "${defense}".`,
            "Widerspruch juristisch prüfen und dokumentieren.",
            now
          )
        );
        break;
      }
    }
  }

  return gaps;
}

export function buildCommunications(entries: CommunicationEntry[]): MatterCommunicationEntry[] {
  return entries
    .filter((c) => c.id && c.timestamp)
    .map((c) => ({
      id: c.id,
      channel: c.channel,
      direction: c.direction,
      subject: c.subject ?? c.summary ?? "(kein Betreff)",
      timestamp: c.timestamp,
      counterpart: c.counterpart,
      lawyer: c.lawyer,
      privileged: c.privileged ?? false,
      has_attachments: (c.attachment_slugs?.length ?? 0) > 0,
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function buildPermissionSummary(
  permissions: PermissionInfo | undefined
): MatterPermissionSummary {
  const allowed = permissions?.allowed_users ?? [];
  const blocked = permissions?.blocked_users ?? [];
  return {
    visibility: permissions?.visibility ?? "full",
    privileged: permissions?.privileged ?? false,
    legal_hold: permissions?.legal_hold ?? false,
    allowed_users: allowed,
    blocked_users: blocked,
    ethical_wall_active: blocked.length > 0,
  };
}

function areContradictory(a: string, b: string): boolean {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // 1. Direct negation pairs (expanded from 4 to 15+)
  const negationPairs = [
    ["nicht", ""],
    ["bestreitet", "zugestanden"],
    ["leugnet", "eingestanden"],
    ["abweisung", "antrag"],
    ["abgelehnt", "angenommen"],
    ["verweigert", "akzeptiert"],
    ["kein", ""],
    ["niemals", "immer"],
    ["nie", "schon"],
    ["keine", ""],
    ["widerspricht", "bestätigt"],
    ["strittig", "unstrittig"],
    ["umstritten", "eingeräumt"],
    ["nicht wahr", "wahr"],
    ["falsch", "richtig"],
    ["unrichtig", "zutreffend"],
    ["bestritten", "eingeräumt"],
    ["in Abrede", "eingestanden"],
    ["nicht der Fall", "der Fall"],
  ];
  for (const [neg, pos] of negationPairs) {
    if (aLower.includes(neg) && bLower.includes(pos)) return true;
    if (bLower.includes(neg) && aLower.includes(pos)) return true;
  }

  // 2. Antonym detection — common legal antonym pairs
  const antonymPairs = [
    ["gezahlt", "nicht gezahlt"],
    ["erfüllt", "nicht erfüllt"],
    ["vorhanden", "nicht vorhanden"],
    ["verschuldet", "nicht verschuldet"],
    ["haftbar", "nicht haftbar"],
    ["schuldig", "nicht schuldig"],
    ["zulässig", "unzulässig"],
    ["begründet", "unbegründet"],
    ["rechtens", "nicht rechtens"],
    ["gültig", "ungültig"],
    ["wirksam", "unwirksam"],
    ["verbindlich", "unverbindlich"],
    ["pflicht", "keine pflicht"],
    ["anspruch", "kein anspruch"],
    ["schaden", "kein schaden"],
    ["verschulden", "kein verschulden"],
    ["ursache", "keine ursache"],
    ["kausal", "nicht kausal"],
  ];
  for (const [pos, neg] of antonymPairs) {
    if (aLower.includes(pos) && bLower.includes(neg)) return true;
    if (bLower.includes(pos) && aLower.includes(neg)) return true;
    if (aLower.includes(neg) && bLower.includes(pos)) return true;
    if (bLower.includes(neg) && aLower.includes(pos)) return true;
  }

  // 3. Semantic overlap with opposing stance
  // If both strings share significant token overlap but one has a negation
  // marker, they likely contradict.
  const negationMarkers = [
    "nicht",
    "kein",
    "keine",
    "niemals",
    "nie",
    "bestreitet",
    "leugnet",
    "verneint",
    "strittig",
    "umstritten",
    "abgelehnt",
    "verweigert",
    "widerspricht",
  ];
  const aTokens = new Set(aLower.split(/\s+/).filter((t) => t.length > 3));
  const bTokens = new Set(bLower.split(/\s+/).filter((t) => t.length > 3));
  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++;
  }
  const overlapRatio = overlap / Math.max(aTokens.size, bTokens.size, 1);
  if (overlapRatio > 0.3) {
    const aHasNeg = negationMarkers.some((m) => aLower.includes(m));
    const bHasNeg = negationMarkers.some((m) => bLower.includes(m));
    // If they overlap significantly but exactly one has a negation marker
    if (aHasNeg !== bHasNeg) return true;
  }

  return false;
}

async function checkDmsSources(
  engineUrl: string,
  headers: Record<string, string>
): Promise<SourceCoverageEntry[]> {
  const sources: SourceCoverageEntry[] = [];

  try {
    const res = await fetch(`${engineUrl}/api/connectors`, { headers });
    if (res.ok) {
      const data = (await res.json()) as {
        connectors?: Array<{
          service: string;
          configured: boolean;
          connected: boolean;
          last_sync_at?: number;
        }>;
      };
      for (const conn of data.connectors ?? []) {
        if (conn.service === "imanage" || conn.service === "netdocuments") {
          sources.push({
            source_id: `dms-${conn.service}`,
            source_label: conn.service === "imanage" ? "iManage DMS" : "NetDocuments DMS",
            source_type: "dms",
            connected: conn.connected,
            last_sync_at: conn.last_sync_at ? new Date(conn.last_sync_at).toISOString() : null,
            document_count: 0,
            index_fresh: conn.connected,
            ocr_complete: true,
            error:
              conn.configured && !conn.connected ? "Konfiguriert aber nicht verbunden" : undefined,
          });
        }
      }
    }
  } catch {
    // Connectors API not available
  }

  return sources;
}

function checkCommunicationSources(fm?: CaseFrontmatter): SourceCoverageEntry[] {
  const sources: SourceCoverageEntry[] = [];

  // Email
  sources.push({
    source_id: "email",
    source_label: "E-Mail / Outlook",
    source_type: "email",
    connected: false, // Would need connector check
    last_sync_at: null,
    document_count: 0,
    index_fresh: false,
    ocr_complete: true,
  });

  // WhatsApp
  sources.push({
    source_id: "whatsapp",
    source_label: "WhatsApp",
    source_type: "whatsapp",
    connected: false,
    last_sync_at: null,
    document_count: 0,
    index_fresh: false,
    ocr_complete: true,
  });

  // Portal
  sources.push({
    source_id: "portal",
    source_label: "Mandantenportal",
    source_type: "portal",
    connected: fm?.portal_enabled ?? false,
    last_sync_at: null,
    document_count: 0,
    index_fresh: fm?.portal_enabled ?? false,
    ocr_complete: true,
  });

  return sources;
}

export function calculateCompletenessScore(sources: SourceCoverageEntry[]): number {
  if (sources.length === 0) return 0;
  let score = 0;
  for (const s of sources) {
    let sourceScore = 0;
    if (s.connected) sourceScore += 0.4;
    if (s.index_fresh) sourceScore += 0.3;
    if (s.ocr_complete) sourceScore += 0.2;
    if (!s.error) sourceScore += 0.1;
    score += sourceScore;
  }
  return Math.min(score / sources.length, 1);
}

export function inferSearchMode(
  score: number,
  snippet: string
): RetrievalExplanation["search_mode"] {
  if (score > 0.8) return "hybrid";
  if (snippet.length > 100) return "semantic";
  return "keyword";
}

export function inferSourceType(slug: string): string | undefined {
  if (slug.startsWith("legal/norms/")) return "statute";
  if (slug.startsWith("legal/deadlines/")) return "deadline";
  if (slug.startsWith("cases/")) return "case";
  if (slug.startsWith("contacts/")) return "contact";
  if (slug.startsWith("documents/")) return "document";
  if (slug.startsWith("invoices/")) return "invoice";
  return undefined;
}

export function calculateRecencyHours(isoDate: string): number {
  const date = new Date(isoDate);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
}

function makeGap(
  type: GapType,
  severity: GapSeverity,
  title: string,
  description: string,
  recommendation: string,
  now: Date,
  relatedEntity?: string
): MatterGap {
  return {
    type,
    severity,
    title,
    description,
    recommendation,
    detected_at: now.toISOString(),
    related_entity: relatedEntity,
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

function emptyContext(
  normalizedSlug: string,
  originalSlug: string,
  now: string,
  engineReachable: boolean
): MatterContextBundle {
  return {
    case_slug: normalizedSlug,
    case_title: originalSlug,
    parties: [],
    deadlines: [],
    documents: [],
    recent_activity: [],
    facts: [],
    communications: [],
    document_requests: [],
    intake_requests: [],
    conversation_events: [],
    permissions: buildPermissionSummary(undefined),
    coverage: {
      sources: [],
      total_sources: 0,
      connected_sources: 0,
      fresh_sources: 0,
      stale_sources: 0,
      error_sources: 0,
      ocr_pending: 0,
      overall_freshness: "unknown",
      completeness_score: 0,
      warnings: ["Akte nicht gefunden oder Engine nicht erreichbar"],
    },
    gaps: [
      makeGap(
        "engine_unreachable",
        "critical",
        "Akte nicht gefunden",
        `Die Akte "${originalSlug}" konnte nicht geladen werden. Entweder existiert sie nicht oder die Engine ist nicht erreichbar.`,
        "Slug prüfen oder Engine-Verbindung sicherstellen.",
        new Date(now)
      ),
    ],
    generated_at: now,
    engine_reachable: engineReachable,
  };
}

// ── Query Mode → Engine Mode Mapping ──────────────────────────────────

export function mapQueryModeToEngineMode(
  mode: QueryMode
): "conservative" | "balanced" | "tokenmax" {
  switch (mode) {
    case "conservative":
      return "conservative";
    case "deep_matter":
      return "tokenmax";
    case "balanced":
    default:
      return "balanced";
  }
}

// ── Matter Understanding Panel ("Akte verstanden?") ───────────────────

export function buildUnderstandingPanel(bundle: MatterContextBundle): MatterUnderstandingPanel {
  const risks = deriveRisks(bundle);
  const freshness = assessFreshness(bundle);
  const recentlyChanged = deriveRecentlyChangedSources(bundle);
  const understandingScore = calculateUnderstandingScore(bundle, risks, freshness);
  const summary = buildSummary(bundle, understandingScore);

  return {
    case_slug: bundle.case_slug,
    case_title: bundle.case_title,
    understanding_score: understandingScore,
    summary,
    facts: bundle.facts,
    gaps: bundle.gaps,
    risks,
    freshness,
    recently_changed_sources: recentlyChanged,
    engine_reachable: bundle.engine_reachable,
    generated_at: bundle.generated_at,
  };
}

function deriveRisks(bundle: MatterContextBundle): MatterRiskItem[] {
  const risks: MatterRiskItem[] = [];

  for (const gap of bundle.gaps) {
    if (gap.severity === "critical" || gap.severity === "high") {
      risks.push({
        id: `gap-${gap.type}`,
        title: gap.title,
        severity: gap.severity as "critical" | "high" | "medium" | "low",
        source: "gap_detection",
        recommendation: gap.recommendation,
      });
    }
  }

  const overdueDeadlines = bundle.deadlines.filter((d) => d.urgency === "overdue");
  for (const d of overdueDeadlines) {
    risks.push({
      id: `deadline-overdue-${d.id}`,
      title: `Überfällige Frist: ${d.title}`,
      severity: "critical",
      source: "deadline_monitor",
      recommendation: "Frist sofort klären oder Wiedereinsetzung prüfen.",
    });
  }

  const unreviewedDocs = bundle.documents.filter(
    (d) => d.ocr_status === "unknown" || d.ocr_status === "ocr_needed"
  );
  if (unreviewedDocs.length > 3) {
    risks.push({
      id: "many-unreviewed-docs",
      title: `${unreviewedDocs.length} unreviewed Dokumente`,
      severity: "medium",
      source: "document_review",
      recommendation: "Dokumente prüfen und OCR-Status aktualisieren.",
    });
  }

  return risks;
}

function assessFreshness(bundle: MatterContextBundle): MatterUnderstandingPanel["freshness"] {
  const sources = bundle.coverage.sources;
  const freshCount = sources.filter((s) => s.index_fresh).length;
  const staleCount = sources.filter((s) => !s.index_fresh).length;
  const lastActivity = bundle.recent_activity.length > 0 ? bundle.recent_activity[0].at : null;

  let overall: "fresh" | "stale" | "unknown" = "unknown";
  if (sources.length > 0) {
    const freshRatio = freshCount / sources.length;
    if (freshRatio >= 0.7) overall = "fresh";
    else if (freshRatio < 0.3) overall = "stale";
    else overall = "fresh";
  }

  return {
    overall,
    completeness_score: bundle.coverage.completeness_score,
    stale_sources: staleCount,
    fresh_sources: freshCount,
    total_sources: sources.length,
    last_activity: lastActivity,
  };
}

function deriveRecentlyChangedSources(bundle: MatterContextBundle): RecentlyChangedSource[] {
  return bundle.coverage.sources
    .filter((s) => s.last_sync_at)
    .sort((a, b) => {
      const aTime = new Date(a.last_sync_at ?? 0).getTime();
      const bTime = new Date(b.last_sync_at ?? 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 10)
    .map((s) => ({
      source_id: s.source_id,
      source_type: s.source_type,
      last_sync_at: s.last_sync_at,
      change_type: "synced" as const,
      document_count: s.document_count,
      fresh: s.index_fresh,
    }));
}

function calculateUnderstandingScore(
  bundle: MatterContextBundle,
  risks: MatterRiskItem[],
  freshness: MatterUnderstandingPanel["freshness"]
): number {
  let score = 0;

  const hasParties = bundle.parties.length > 0 ? 0.15 : 0;
  const hasDeadlines = bundle.deadlines.length > 0 ? 0.1 : 0;
  const hasDocuments = bundle.documents.length > 0 ? 0.1 : 0;
  const hasFacts = bundle.facts.length > 0 ? 0.15 : 0;
  const hasCommunications = bundle.communications.length > 0 ? 0.05 : 0;
  const coverageScore = bundle.coverage.completeness_score * 0.2;
  const engineOk = bundle.engine_reachable ? 0.1 : 0;
  const freshnessScore = !bundle.engine_reachable
    ? 0
    : freshness.overall === "fresh"
      ? 0.1
      : freshness.overall === "stale"
        ? 0.02
        : 0.05;

  score =
    hasParties +
    hasDeadlines +
    hasDocuments +
    hasFacts +
    hasCommunications +
    coverageScore +
    engineOk +
    freshnessScore;

  const criticalRisks = risks.filter((r) => r.severity === "critical").length;
  const highRisks = risks.filter((r) => r.severity === "high").length;
  score -= criticalRisks * 0.1;
  score -= highRisks * 0.05;

  const gapPenalty = Math.min(bundle.gaps.length * 0.02, 0.15);
  score -= gapPenalty;

  return Math.max(0, Math.min(1, score));
}

function buildSummary(bundle: MatterContextBundle, score: number): string {
  const parts: string[] = [];

  if (!bundle.engine_reachable) {
    return "Engine nicht erreichbar — Aktenkontext konnte nicht vollständig geladen werden.";
  }

  parts.push(`${bundle.parties.length} Parteien`);
  parts.push(`${bundle.deadlines.length} Fristen`);
  parts.push(`${bundle.documents.length} Dokumente`);
  parts.push(`${bundle.facts.length} Fakten`);

  if (bundle.communications.length > 0) {
    parts.push(`${bundle.communications.length} Kommunikationen`);
  }

  const criticalGaps = bundle.gaps.filter((g) => g.severity === "critical").length;
  if (criticalGaps > 0) {
    parts.push(`${criticalGaps} kritische Lücke(n)`);
  }

  const pct = Math.round(score * 100);
  const level = pct >= 80 ? "gut verstanden" : pct >= 50 ? "teilweise verstanden" : "lückenhaft";

  return `Akte ${level} (${pct}%). ${parts.join(", ")}.`;
}
