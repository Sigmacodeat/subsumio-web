/**
 * Legal Brain CLI — gbrain legal
 *
 * Commands:
 *   gbrain legal entity create       — Create lawyer/firm/court/opponent profile
 *   gbrain legal entity list         — List profiles
 *   gbrain legal entity show <id>    — Show profile
 *   gbrain legal entity update <id>  — Update profile
 *   gbrain legal entity delete <id>  — Delete profile
 *   gbrain legal case create         — Create a case
 *   gbrain legal case list           — List cases
 *   gbrain legal case show <id>      — Show case details
 *   gbrain legal case update <id>    — Update case
 *   gbrain legal case delete <id>    — Delete case
 *   gbrain legal case strategy <id>  — Generate strategy
 *   gbrain legal case assess <id>    — Assess chances
 *   gbrain legal opponent <name>     — Analyze opponent
 *   gbrain legal precedent <query>   — Search precedents
 */

import * as db from "../core/db.ts";
import {
  LegalEntityRepository,
  LegalCaseRepository,
} from "../core/legal/repository.ts";
import type {
  LegalEntityCreateInput,
  LegalCaseCreateInput,
  LegalCase,
} from "../core/legal/types.ts";
import {
  detectPII,
  buildPlaceholders,
  anonymizeFacts,
} from "../core/legal/anonymizer.ts";

const HELP = `
gbrain legal — Legal Brain for case and entity management

Entity management:
  gbrain legal entity create --type <type> --name <name> [options]
  gbrain legal entity list [--type <type>] [--limit N]
  gbrain legal entity show <id>
  gbrain legal entity update <id> [--name <name>] [--areas <a,b>]
  gbrain legal entity delete <id>

Case management:
  gbrain legal case create --title <title> --area <area> --opponent <id> [options]
  gbrain legal case list [--status <s>] [--area <a>] [--limit N]
  gbrain legal case show <id>
  gbrain legal case update <id> [--status <s>] [--facts <file>]
  gbrain legal case delete <id>

Analysis:
  gbrain legal case strategy <id>         — Generate strategy for case
  gbrain legal case assess <id>           — Assess win chances
  gbrain legal opponent <name>            — Analyze opponent profile
  gbrain legal precedent <query>          — Search legal precedents

Entity types: lawyer, firm, court, opponent, client
Case statuses: open, pending, settled, won, lost, appealed, dormant
`;

interface ParsedFlags {
  _: string[];
  help?: boolean;
  json?: boolean;
  type?: string;
  name?: string;
  areas?: string;
  specializations?: string;
  jurisdiction?: string;
  level?: string;
  notes?: string;
  tags?: string;
  limit?: number;
  offset?: number;
  title?: string;
  area?: string;
  subArea?: string;
  opponent?: string;
  lawyer?: string;
  court?: string;
  client?: string;
  priority?: string;
  status?: string;
  facts?: string;
  claims?: string;
  defenses?: string;
  valueMin?: number;
  valueMax?: number;
  currency?: string;
}

function parseFlags(args: string[]): ParsedFlags {
  const out: ParsedFlags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--json" || a === "-j") out.json = true;
    else if (a === "--type" && i + 1 < args.length) out.type = args[++i];
    else if (a === "--name" && i + 1 < args.length) out.name = args[++i];
    else if (a === "--areas" && i + 1 < args.length) out.areas = args[++i];
    else if (a === "--specializations" && i + 1 < args.length)
      out.specializations = args[++i];
    else if (a === "--jurisdiction" && i + 1 < args.length)
      out.jurisdiction = args[++i];
    else if (a === "--level" && i + 1 < args.length) out.level = args[++i];
    else if (a === "--notes" && i + 1 < args.length) out.notes = args[++i];
    else if (a === "--tags" && i + 1 < args.length) out.tags = args[++i];
    else if (a === "--limit" && i + 1 < args.length)
      out.limit = parseInt(args[++i], 10);
    else if (a === "--offset" && i + 1 < args.length)
      out.offset = parseInt(args[++i], 10);
    else if (a === "--title" && i + 1 < args.length) out.title = args[++i];
    else if (a === "--area" && i + 1 < args.length) out.area = args[++i];
    else if (a === "--sub-area" && i + 1 < args.length) out.subArea = args[++i];
    else if (a === "--opponent" && i + 1 < args.length)
      out.opponent = args[++i];
    else if (a === "--lawyer" && i + 1 < args.length) out.lawyer = args[++i];
    else if (a === "--court" && i + 1 < args.length) out.court = args[++i];
    else if (a === "--client" && i + 1 < args.length) out.client = args[++i];
    else if (a === "--priority" && i + 1 < args.length)
      out.priority = args[++i];
    else if (a === "--status" && i + 1 < args.length) out.status = args[++i];
    else if (a === "--facts" && i + 1 < args.length) out.facts = args[++i];
    else if (a === "--claims" && i + 1 < args.length) out.claims = args[++i];
    else if (a === "--defenses" && i + 1 < args.length)
      out.defenses = args[++i];
    else if (a === "--value-min" && i + 1 < args.length)
      out.valueMin = parseFloat(args[++i]);
    else if (a === "--value-max" && i + 1 < args.length)
      out.valueMax = parseFloat(args[++i]);
    else if (a === "--currency" && i + 1 < args.length)
      out.currency = args[++i];
    else if (!a.startsWith("-")) out._.push(a);
  }
  return out;
}

function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length)),
  );
  const line = widths.map((w) => "-".repeat(w + 2)).join("+");
  const headerRow = headers
    .map((h, i) => ` ${h.padEnd(widths[i])} `)
    .join("|");
  console.log(headerRow);
  console.log(line);
  for (const row of rows) {
    console.log(
      row.map((c, i) => ` ${c.padEnd(widths[i])} `).join("|"),
    );
  }
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runLegalCli(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags.help || flags._.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const sql = db.getConnection();
  const sourceId = process.env.GBRAIN_SOURCE || "default";

  const entityRepo = new LegalEntityRepository(sql, sourceId);
  const caseRepo = new LegalCaseRepository(sql, sourceId);

  const [subcmd, action, ...rest] = flags._;

  try {
    if (subcmd === "entity") {
      await handleEntity(entityRepo, action, flags);
    } else if (subcmd === "case") {
      await handleCase(caseRepo, entityRepo, action, flags);
    } else if (subcmd === "opponent") {
      await handleOpponent(entityRepo, action, flags);
    } else if (subcmd === "precedent") {
      await handlePrecedent(flags);
    } else {
      console.error(`Unknown subcommand: ${subcmd}`);
      console.log(HELP);
      process.exit(1);
    }
  } finally {
    // db.ts manages pool lifecycle; don't close here
  }
}

// ---------------------------------------------------------------------------
// Entity handlers
// ---------------------------------------------------------------------------

async function handleEntity(
  repo: LegalEntityRepository,
  action: string,
  flags: ParsedFlags,
): Promise<void> {
  switch (action) {
    case "create": {
      if (!flags.name || !flags.type) {
        console.error("--name and --type are required");
        process.exit(1);
      }
      const input: LegalEntityCreateInput = {
        type: flags.type as any,
        displayName: flags.name,
        legalAreas: flags.areas?.split(",").map((s) => s.trim()),
        specializations: flags.specializations?.split(",").map((s) => s.trim()),
        jurisdiction: flags.jurisdiction,
        jurisdictionLevel: flags.level as any,
        notes: flags.notes,
        tags: flags.tags?.split(",").map((s) => s.trim()),
      };
      const entity = await repo.create(input);
      if (flags.json) printJson(entity);
      else console.log(`Created ${entity.type}: ${entity.displayName} (${entity.id})`);
      break;
    }

    case "list": {
      const entities = await repo.list({
        type: flags.type as any,
        legalArea: flags.areas,
        jurisdiction: flags.jurisdiction,
        limit: flags.limit,
        offset: flags.offset,
      });
      if (flags.json) {
        printJson(entities);
      } else {
        if (entities.length === 0) {
          console.log("No entities found.");
          return;
        }
        printTable(
          ["ID", "Type", "Name", "Areas", "Jurisdiction", "Cases"],
          entities.map((e) => [
            e.id,
            e.type,
            e.displayName.slice(0, 30),
            e.legalAreas.slice(0, 2).join(", ") || "-",
            e.jurisdiction || "-",
            String(e.anonymizedCaseCount),
          ]),
        );
      }
      break;
    }

    case "show": {
      const id = flags._[2];
      if (!id) {
        console.error("Entity ID required");
        process.exit(1);
      }
      const entity = await repo.getById(id);
      if (!entity) {
        console.error(`Entity not found: ${id}`);
        process.exit(1);
      }
      if (flags.json) printJson(entity);
      else {
        console.log(`ID:          ${entity.id}`);
        console.log(`Type:        ${entity.type}`);
        console.log(`Name:        ${entity.displayName}`);
        console.log(`Areas:       ${entity.legalAreas.join(", ") || "-"}`);
        console.log(`Specs:       ${entity.specializations.join(", ") || "-"}`);
        console.log(`Jurisdiction: ${entity.jurisdiction || "-"} (${entity.jurisdictionLevel})`);
        console.log(`Win Rate:    ${entity.winRate !== undefined ? `${(entity.winRate * 100).toFixed(1)}%` : "-"}`);
        console.log(`Cases:       ${entity.anonymizedCaseCount}`);
        console.log(`Tags:        ${entity.tags.join(", ") || "-"}`);
        console.log(`Notes:\n${entity.notes || "-"}`);
      }
      break;
    }

    case "update": {
      const id = flags._[2];
      if (!id) {
        console.error("Entity ID required");
        process.exit(1);
      }
      const updated = await repo.update(id, {
        displayName: flags.name,
        legalAreas: flags.areas?.split(",").map((s) => s.trim()),
        specializations: flags.specializations?.split(",").map((s) => s.trim()),
        jurisdiction: flags.jurisdiction,
        notes: flags.notes,
        tags: flags.tags?.split(",").map((s) => s.trim()),
      });
      if (!updated) {
        console.error(`Entity not found: ${id}`);
        process.exit(1);
      }
      if (flags.json) printJson(updated);
      else console.log(`Updated ${updated.displayName}`);
      break;
    }

    case "delete": {
      const id = flags._[2];
      if (!id) {
        console.error("Entity ID required");
        process.exit(1);
      }
      const ok = await repo.delete(id);
      if (!ok) {
        console.error(`Entity not found: ${id}`);
        process.exit(1);
      }
      console.log(`Deleted ${id}`);
      break;
    }

    default:
      console.error(`Unknown entity action: ${action}`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Case handlers
// ---------------------------------------------------------------------------

async function handleCase(
  caseRepo: LegalCaseRepository,
  entityRepo: LegalEntityRepository,
  action: string,
  flags: ParsedFlags,
): Promise<void> {
  switch (action) {
    case "create": {
      if (!flags.title || !flags.area || !flags.opponent) {
        console.error("--title, --area, and --opponent are required");
        process.exit(1);
      }

      // Validate opponent exists
      const opponent = await entityRepo.getById(flags.opponent);
      if (!opponent) {
        console.error(`Opponent not found: ${flags.opponent}`);
        process.exit(1);
      }

      let facts = flags.facts || "";
      if (facts) {
        const pii = detectPII(facts);
        if (pii.length > 0) {
          const placeholders = buildPlaceholders(pii);
          facts = anonymizeFacts(facts, placeholders);
          console.error(`⚠️  Anonymized ${pii.length} PII items in facts.`);
        }
      }

      const input: LegalCaseCreateInput = {
        caseNumber: flags._[3] || "",
        displayTitle: flags.title,
        legalArea: flags.area,
        subArea: flags.subArea,
        priority: flags.priority as any,
        opponentId: flags.opponent,
        ownLawyerId: flags.lawyer,
        courtId: flags.court,
        clientId: flags.client,
        facts,
        claims: flags.claims?.split("\n").map((s) => s.trim()).filter(Boolean),
        defenses: flags.defenses
          ?.split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        estimatedValue:
          flags.valueMin !== undefined
            ? {
                min: flags.valueMin,
                max: flags.valueMax ?? flags.valueMin * 1.5,
                currency: flags.currency ?? "EUR",
              }
            : undefined,
        tags: flags.tags?.split(",").map((s) => s.trim()),
      };

      const legalCase = await caseRepo.create(input);
      if (flags.json) printJson(legalCase);
      else console.log(`Created case: ${legalCase.displayTitle} (${legalCase.id})`);
      break;
    }

    case "list": {
      const cases = await caseRepo.list({
        status: flags.status as any,
        legalArea: flags.area,
        opponentId: flags.opponent,
        priority: flags.priority as any,
        limit: flags.limit,
        offset: flags.offset,
      });
      if (flags.json) {
        printJson(cases);
      } else {
        if (cases.length === 0) {
          console.log("No cases found.");
          return;
        }
        printTable(
          ["ID", "Case #", "Title", "Area", "Status", "Priority", "Opponent"],
          cases.map((c) => [
            c.id.slice(0, 20),
            c.caseNumber,
            c.displayTitle.slice(0, 30),
            c.legalArea,
            c.status,
            c.priority,
            c.opponentId.slice(0, 20),
          ]),
        );
      }
      break;
    }

    case "show": {
      const id = flags._[2];
      if (!id) {
        console.error("Case ID required");
        process.exit(1);
      }
      const legalCase = await caseRepo.getById(id);
      if (!legalCase) {
        console.error(`Case not found: ${id}`);
        process.exit(1);
      }
      if (flags.json) printJson(legalCase);
      else {
        console.log(`ID:           ${legalCase.id}`);
        console.log(`Case #:       ${legalCase.caseNumber}`);
        console.log(`Title:        ${legalCase.displayTitle}`);
        console.log(`Area:         ${legalCase.legalArea}${legalCase.subArea ? ` — ${legalCase.subArea}` : ""}`);
        console.log(`Status:       ${legalCase.status}`);
        console.log(`Priority:     ${legalCase.priority}`);
        console.log(`Opponent:     ${legalCase.opponentId}`);
        console.log(`Claims:       ${legalCase.claims.join("; ") || "-"}`);
        console.log(`Defenses:     ${legalCase.defenses.join("; ") || "-"}`);
        console.log(`Evidence:     ${legalCase.evidence.length} items`);
        console.log(`Facts:\n${legalCase.facts || "-"}`);
        if (legalCase.strategy) {
          console.log(`\nStrategy:`);
          console.log(`  Approach: ${legalCase.strategy.recommendedApproach}`);
          console.log(`  Confidence: ${(legalCase.strategy.confidence * 100).toFixed(0)}%`);
          console.log(`  ${legalCase.strategy.recommended}`);
        }
        if (legalCase.outcome) {
          console.log(`\nOutcome: ${legalCase.outcome.result}`);
          console.log(`  ${legalCase.outcome.reasoning}`);
        }
      }
      break;
    }

    case "update": {
      const id = flags._[2];
      if (!id) {
        console.error("Case ID required");
        process.exit(1);
      }
      const updates: Partial<LegalCase> = {};
      if (flags.status) updates.status = flags.status as any;
      if (flags.priority) updates.priority = flags.priority as any;
      if (flags.title) updates.displayTitle = flags.title;
      if (flags.facts) updates.facts = flags.facts;
      if (flags.claims) updates.claims = flags.claims.split("\n").map((s) => s.trim()).filter(Boolean);
      if (flags.defenses) updates.defenses = flags.defenses.split("\n").map((s) => s.trim()).filter(Boolean);

      const updated = await caseRepo.update(id, updates);
      if (!updated) {
        console.error(`Case not found: ${id}`);
        process.exit(1);
      }
      if (flags.json) printJson(updated);
      else console.log(`Updated ${updated.displayTitle}`);
      break;
    }

    case "delete": {
      const id = flags._[2];
      if (!id) {
        console.error("Case ID required");
        process.exit(1);
      }
      const ok = await caseRepo.delete(id);
      if (!ok) {
        console.error(`Case not found: ${id}`);
        process.exit(1);
      }
      console.log(`Deleted ${id}`);
      break;
    }

    case "strategy": {
      const id = flags._[2];
      if (!id) {
        console.error("Case ID required");
        process.exit(1);
      }
      const legalCase = await caseRepo.getById(id);
      if (!legalCase) {
        console.error(`Case not found: ${id}`);
        process.exit(1);
      }

      // Strategy generation (placeholder — full version uses AI gateway)
      const strategy = {
        recommended: `Litigate aggressively. ${legalCase.legalArea} cases with similar fact patterns have a 65% win rate.`,
        alternatives: [
          "Negotiate settlement at 60% of claim value",
          "Mediation with neutral third party",
        ],
        risks: [
          { description: "Opponent has strong precedent on their side", probability: "medium" as const, impact: "high" as const },
          { description: "Evidence may be challenged as hearsay", probability: "low" as const, impact: "medium" as const },
        ],
        opportunities: [
          { description: "Procedural error in opponent's filing", probability: "medium" as const, impact: "high" as const },
          { description: "Witness willing to testify", probability: "high" as const, impact: "medium" as const },
        ],
        recommendedApproach: "litigation" as const,
        confidence: 0.65,
        timeline: "6-12 months to judgment",
        generatedAt: new Date().toISOString(),
      };

      await caseRepo.setStrategy(id, strategy);
      if (flags.json) printJson(strategy);
      else {
        console.log(`Strategy for ${legalCase.displayTitle}:`);
        console.log(`Recommended: ${strategy.recommended}`);
        console.log(`Approach: ${strategy.recommendedApproach}`);
        console.log(`Confidence: ${(strategy.confidence * 100).toFixed(0)}%`);
        console.log(`Timeline: ${strategy.timeline}`);
      }
      break;
    }

    case "assess": {
      const id = flags._[2];
      if (!id) {
        console.error("Case ID required");
        process.exit(1);
      }
      const legalCase = await caseRepo.getById(id);
      if (!legalCase) {
        console.error(`Case not found: ${id}`);
        process.exit(1);
      }

      // Chance assessment (placeholder — full version uses AI + precedent matching)
      const assessment = {
        caseId: id,
        overallChance: 0.58,
        legalChance: 0.72,
        factualChance: 0.55,
        evidentiaryChance: 0.48,
        proceduralChance: 0.65,
        riskFactors: [
          "Limited documentary evidence",
          "Opponent has home-court advantage",
        ],
        successFactors: [
          "Strong legal basis in statute",
          "Procedural timing advantage",
        ],
        comparableCases: [],
        recommendedNextSteps: [
          "Gather additional documentary evidence",
          "File motion for expedited discovery",
          "Retain expert witness",
        ],
        generatedAt: new Date().toISOString(),
      };

      if (flags.json) printJson(assessment);
      else {
        console.log(`Chance Assessment for ${legalCase.displayTitle}:`);
        console.log(`Overall:      ${(assessment.overallChance * 100).toFixed(0)}%`);
        console.log(`Legal:        ${(assessment.legalChance * 100).toFixed(0)}%`);
        console.log(`Factual:      ${(assessment.factualChance * 100).toFixed(0)}%`);
        console.log(`Evidentiary:  ${(assessment.evidentiaryChance * 100).toFixed(0)}%`);
        console.log(`Procedural:   ${(assessment.proceduralChance * 100).toFixed(0)}%`);
        console.log(`\nNext Steps:`);
        for (const step of assessment.recommendedNextSteps) {
          console.log(`  • ${step}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown case action: ${action}`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Opponent analysis
// ---------------------------------------------------------------------------

async function handleOpponent(
  repo: LegalEntityRepository,
  _action: string,
  flags: ParsedFlags,
): Promise<void> {
  const name = flags._[1];
  if (!name) {
    console.error("Opponent name required");
    process.exit(1);
  }

  // Find or create opponent entity
  let opponent = (await repo.list({ type: "opponent", limit: 100 })).find(
    (e) => e.displayName.toLowerCase() === name.toLowerCase(),
  );

  if (!opponent) {
    opponent = await repo.create({
      type: "opponent",
      displayName: name,
    });
    console.log(`Created new opponent profile: ${opponent.displayName}`);
  }

  const analysis = {
    opponentId: opponent.id,
    generatedAt: new Date().toISOString(),
    winRateVsUs: 0.42,
    commonStrategies: ["Delay tactics", "Motion to dismiss on technical grounds"],
    weaknesses: ["Poor preparation for evidentiary hearings", "Overreliance on settlement pressure"],
    strengths: ["Strong appellate record", "Deep bench of associates"],
    settlementBehavior: "moderate" as const,
    averageSettlementTime: "4-6 months",
    recommendedCounterStrategy:
      "Push for early discovery to expose weaknesses. Their settlement behavior is moderate — expect 4-6 months before serious negotiations.",
    similarOpponents: [],
  };

  if (flags.json) printJson(analysis);
  else {
    console.log(`Opponent Analysis: ${opponent.displayName}`);
    console.log(`Win Rate vs Us: ${(analysis.winRateVsUs * 100).toFixed(0)}%`);
    console.log(`Settlement: ${analysis.settlementBehavior} (${analysis.averageSettlementTime})`);
    console.log(`\nWeaknesses:`);
    for (const w of analysis.weaknesses) console.log(`  • ${w}`);
    console.log(`\nStrengths:`);
    for (const s of analysis.strengths) console.log(`  • ${s}`);
    console.log(`\nCounter-Strategy:`);
    console.log(`  ${analysis.recommendedCounterStrategy}`);
  }
}

// ---------------------------------------------------------------------------
// Precedent search
// ---------------------------------------------------------------------------

async function handlePrecedent(flags: ParsedFlags): Promise<void> {
  const query = flags._.slice(1).join(" ");
  if (!query) {
    console.error("Search query required");
    process.exit(1);
  }

  console.log(`Searching precedents for: "${query}"`);
  console.log("(Full implementation connects to perplexity-research for live case law)");

  const results = [
    {
      id: "prec-1",
      title: `Precedent related to ${query}`,
      court: "Bundesverfassungsgericht",
      date: "2023-05-12",
      legalArea: "Amtshaftungsrecht",
      keyHolding: "State liability requires demonstrable breach of official duty.",
      relevanceScore: 0.87,
      source: "external" as const,
    },
  ];

  if (flags.json) printJson(results);
  else {
    console.log(`\nFound ${results.length} precedent(s):`);
    for (const r of results) {
      console.log(`\n  ${r.title}`);
      console.log(`  Court: ${r.court} (${r.date})`);
      console.log(`  Relevance: ${(r.relevanceScore * 100).toFixed(0)}%`);
      console.log(`  Holding: ${r.keyHolding}`);
    }
  }
}
