/**
 * auto-playbook — Automatically updates playbooks from executed contracts.
 *
 * When a contract is marked as "executed" (frontmatter.status = "executed"),
 * this module extracts the negotiated clause language and updates the
 * corresponding playbook's fallback positions and preferred language.
 *
 * This is the Subsumio equivalent of Harvey's "Contract Intelligence"
 * auto-playbook feature — every signed contract updates your playbooks
 * automatically, so institutional knowledge compounds.
 *
 * Approval flow: by default, updates are staged as "pending" and require
 * manual approval. The `auto_apply` flag can be set to apply directly.
 */

import type { BrainEngine } from "../engine.ts";
import {
  type LegalLLM,
  clipText,
  defaultLegalLLM,
  groundQuotes,
  tryParseJSON,
} from "./llm-util.ts";

export interface PlaybookClauseUpdate {
  clause_type: string;
  fallback_position: string;
  preferred_language: string;
  source_slug: string;
  source_quote: string;
  deviates_from_current: boolean;
}

export interface PlaybookUpdateResult {
  playbook_slug: string;
  playbook_title: string;
  updates: PlaybookClauseUpdate[];
  applied: boolean;
  requires_approval: boolean;
  warnings: string[];
}

export interface AutoPlaybookOpts {
  contract_slug: string;
  playbook_slug?: string;
  auto_apply?: boolean;
  sourceId?: string;
  sourceIds?: string[];
  llm?: LegalLLM;
}

interface PlaybookRule {
  clause_type: string;
  fallback_position?: string;
  preferred_language?: string;
  [key: string]: unknown;
}

interface Playbook {
  slug: string;
  title: string;
  frontmatter: {
    jurisdiction?: string;
    contract_types?: string[];
    rules?: PlaybookRule[];
    [key: string]: unknown;
  };
}

async function loadPlaybook(
  engine: BrainEngine,
  slug: string,
  sourceId?: string
): Promise<Playbook | null> {
  try {
    const page = await engine.getPage(slug, {
      ...(sourceId !== undefined ? { sourceId } : {}),
    });
    if (!page) return null;
    const fm = (page.frontmatter ?? {}) as Playbook["frontmatter"];
    if (!Array.isArray(fm.rules)) return null;
    return {
      slug,
      title: String(page.title ?? slug),
      frontmatter: fm,
    };
  } catch {
    return null;
  }
}

async function findPlaybookForContract(
  engine: BrainEngine,
  contract: { frontmatter: Record<string, unknown>; type?: string },
  sourceId?: string
): Promise<Playbook | null> {
  const contractType = String(
    contract.frontmatter.contract_type ?? contract.frontmatter.document_type ?? ""
  );
  const jurisdiction = String(contract.frontmatter.jurisdiction ?? "all");

  // List all playbooks and find the best match
  const pages = await engine.executeRaw<{
    slug: string;
    title: string;
    frontmatter: Record<string, unknown>;
  }>(
    `SELECT slug, title, frontmatter FROM pages
     WHERE type = 'legal_playbook' AND deleted_at IS NULL
     ${sourceId && sourceId !== "default" ? "AND source_id = $1" : ""}
     LIMIT ${sourceId && sourceId !== "default" ? "$2" : "$1"}`,
    sourceId && sourceId !== "default" ? [sourceId, 50] : [50]
  );

  for (const p of pages) {
    const fm = p.frontmatter as Playbook["frontmatter"];
    if (!Array.isArray(fm.rules)) continue;

    // Match by contract type
    const types = Array.isArray(fm.contract_types) ? fm.contract_types : [];
    const jurMatch =
      !fm.jurisdiction || fm.jurisdiction === "all" || fm.jurisdiction === jurisdiction;
    const typeMatch = types.length === 0 || types.includes(contractType);

    if (jurMatch && typeMatch) {
      return { slug: p.slug, title: p.title, frontmatter: fm };
    }
  }

  return null;
}

function buildExtractionSystem(contractType: string): string {
  return `Du bist ein Legal-Tech-Assistent. Du analysierst einen ausgeführten Vertrag und extrahierst die tatsächlich ausgehandelten Klauselpositionen.

Aufgabe: Für jede Klausel im Vertrag, extrahiere:
1. clause_type: Art der Klausel (z.B. "Haftung", "Geheimhaltung", "Laufzeit", "Kündigung")
2. fallback_position: Die tatsächlich vereinbarte Position (kurz zusammengefasst)
3. preferred_language: Der konkrete Wortlaut der Klausel (max 200 Zeichen)

Antworte AUSSCHLIESSLICH als JSON-Array:
[
  {
    "clause_type": "string",
    "fallback_position": "string",
    "preferred_language": "string",
    "source_quote": "WÖRTLICHES Zitat aus dem Vertrag"
  }
]

Vertragstyp: ${contractType}
HARTE REGEL: source_quote MUSS wörtlich im Vertrag vorkommen.`;
}

export async function autoPlaybookUpdate(
  engine: BrainEngine,
  opts: AutoPlaybookOpts
): Promise<PlaybookUpdateResult> {
  const warnings: string[] = [];

  // 1. Load the contract
  let contractPage: { title: string; content: string; frontmatter: Record<string, unknown> };
  try {
    const page = await engine.getPage(opts.contract_slug, {
      ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
    });
    if (!page) throw new Error("page not found");
    contractPage = {
      title: String(page.title ?? opts.contract_slug),
      content: String(page.compiled_truth ?? ""),
      frontmatter: (page.frontmatter ?? {}) as Record<string, unknown>,
    };
  } catch {
    return {
      playbook_slug: "",
      playbook_title: "",
      updates: [],
      applied: false,
      requires_approval: false,
      warnings: ["CONTRACT_NOT_FOUND"],
    };
  }

  // 2. Find or load the playbook
  let playbook: Playbook | null;
  if (opts.playbook_slug) {
    playbook = await loadPlaybook(engine, opts.playbook_slug, opts.sourceId);
  } else {
    playbook = await findPlaybookForContract(engine, contractPage, opts.sourceId);
  }

  if (!playbook) {
    warnings.push("NO_PLAYBOOK_FOUND — create a playbook for this contract type first");
    return {
      playbook_slug: "",
      playbook_title: "",
      updates: [],
      applied: false,
      requires_approval: false,
      warnings,
    };
  }

  // 3. Extract negotiated positions from the contract using LLM
  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push("NO_LLM_AVAILABLE");
    return {
      playbook_slug: playbook.slug,
      playbook_title: playbook.title,
      updates: [],
      applied: false,
      requires_approval: false,
      warnings,
    };
  }

  const { clipped, warning } = clipText(contractPage.content, 24000);
  if (warning) warnings.push(warning);

  const contractType = String(
    contractPage.frontmatter.contract_type ?? contractPage.frontmatter.document_type ?? "general"
  );
  const system = buildExtractionSystem(contractType);
  const user = `<vertrag>\n${clipped}\n</vertrag>`;

  let raw: string;
  try {
    raw = await llm({ system, user, maxTokens: 3000 });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
    return {
      playbook_slug: playbook.slug,
      playbook_title: playbook.title,
      updates: [],
      applied: false,
      requires_approval: false,
      warnings,
    };
  }

  const parsed = tryParseJSON(raw);
  if (!parsed || !Array.isArray(parsed)) {
    warnings.push("LLM_OUTPUT_NOT_JSON_ARRAY");
    return {
      playbook_slug: playbook.slug,
      playbook_title: playbook.title,
      updates: [],
      applied: false,
      requires_approval: false,
      warnings,
    };
  }

  // 4. Ground source quotes against contract text, then compare against existing rules
  const existingRules = playbook.frontmatter.rules ?? [];

  // Ground each extracted item's source_quote against the contract text
  const { grounded, warnings: groundWarnings } = groundQuotes(
    parsed.filter(
      (item): item is Record<string, unknown> => typeof item === "object" && item !== null
    ),
    (item) => String(item.source_quote ?? ""),
    contractPage.content,
    { label: "PLAYBOOK_QUOTE", minQuoteLen: 12 }
  );
  warnings.push(...groundWarnings);

  const updates: PlaybookClauseUpdate[] = [];

  for (const o of grounded) {
    const clauseType = String(o.clause_type ?? "");
    if (!clauseType) continue;

    const existing = existingRules.find((r) => r.clause_type === clauseType);
    const newFallback = String(o.fallback_position ?? "");
    const newLanguage = String(o.preferred_language ?? "");
    const sourceQuote = String(o.source_quote ?? "");

    const deviates = Boolean(
      !existing ||
      (existing.fallback_position && existing.fallback_position !== newFallback) ||
      (existing.preferred_language && existing.preferred_language !== newLanguage)
    );

    updates.push({
      clause_type: clauseType,
      fallback_position: newFallback,
      preferred_language: newLanguage,
      source_slug: opts.contract_slug,
      source_quote: sourceQuote,
      deviates_from_current: deviates,
    });
  }

  if (updates.length === 0) {
    warnings.push("NO_CLAUSE_UPDATES_EXTRACTED");
    return {
      playbook_slug: playbook.slug,
      playbook_title: playbook.title,
      updates: [],
      applied: false,
      requires_approval: false,
      warnings,
    };
  }

  // 5. Apply or stage updates
  const autoApply = opts.auto_apply === true;

  if (autoApply) {
    // Merge updates into existing rules
    const updatedRules = [...existingRules];
    for (const update of updates) {
      const idx = updatedRules.findIndex((r) => r.clause_type === update.clause_type);
      if (idx >= 0) {
        updatedRules[idx] = {
          ...updatedRules[idx],
          fallback_position: update.fallback_position,
          preferred_language: update.preferred_language,
          last_updated_from: update.source_slug,
          last_updated_at: new Date().toISOString(),
        };
      } else {
        updatedRules.push({
          clause_type: update.clause_type,
          fallback_position: update.fallback_position,
          preferred_language: update.preferred_language,
          added_from: update.source_slug,
          added_at: new Date().toISOString(),
        });
      }
    }

    try {
      const existingPage = await engine.getPage(playbook.slug, {
        ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      });
      if (!existingPage) throw new Error("playbook page not found");
      await engine.putPage(
        playbook.slug,
        {
          type: existingPage.type,
          title: existingPage.title,
          compiled_truth: existingPage.compiled_truth,
          frontmatter: { ...playbook.frontmatter, rules: updatedRules },
        },
        {
          ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
        }
      );
    } catch (e) {
      warnings.push(`PLAYBOOK_UPDATE_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
      return {
        playbook_slug: playbook.slug,
        playbook_title: playbook.title,
        updates,
        applied: false,
        requires_approval: false,
        warnings,
      };
    }

    return {
      playbook_slug: playbook.slug,
      playbook_title: playbook.title,
      updates,
      applied: true,
      requires_approval: false,
      warnings,
    };
  } else {
    // Stage as pending updates in the playbook frontmatter
    const pendingUpdates = (playbook.frontmatter.pending_updates ?? []) as unknown[];
    const newPending = [
      ...pendingUpdates,
      {
        updates,
        source_contract: opts.contract_slug,
        staged_at: new Date().toISOString(),
      },
    ];

    try {
      const existingPage = await engine.getPage(playbook.slug, {
        ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      });
      if (!existingPage) throw new Error("playbook page not found");
      await engine.putPage(
        playbook.slug,
        {
          type: existingPage.type,
          title: existingPage.title,
          compiled_truth: existingPage.compiled_truth,
          frontmatter: { ...playbook.frontmatter, pending_updates: newPending },
        },
        {
          ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
        }
      );
    } catch (e) {
      warnings.push(`PLAYBOOK_STAGE_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
    }

    return {
      playbook_slug: playbook.slug,
      playbook_title: playbook.title,
      updates,
      applied: false,
      requires_approval: true,
      warnings,
    };
  }
}
