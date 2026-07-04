#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * run-toni-gericht-pipeline.ts
 *
 * Lädt die Toni Gericht OCR-Daten auf den Produktionsserver,
 * erstellt einen Case, triggert die Legal-Pipeline und trackt
 * den Verlauf + Kosten.
 *
 * Usage: bun run scripts/run-toni-gericht-pipeline.ts
 */

const ENGINE_URL = process.env.SUBSUMIO_ENGINE_URL ?? "https://api.subsum.io";
const BRAIN_ID = process.env.SUBSUMIO_DEMO_BRAIN ?? "brain_817d98c8";
const API_KEY = process.env.SUBSUMIO_WEB_API_KEY ?? "";
const OCR_DIR = "/Users/msc/Toni Gericht/GESAMTAKTEN ORDNER/_VASIC_DOSKAR_OCR";

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "x-subsumio-source": BRAIN_ID,
  "x-subsumio-api-key": API_KEY,
};

const CASE_SLUG = "legal/cases/toni-gericht-vasic-doskar";
const CASE_TITLE = "Toni Gericht — Vasic/Doskar Apotheken-Betrug";

interface EnginePage {
  slug: string;
  title: string;
  content: string;
  type: string;
  frontmatter: Record<string, unknown>;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function putPage(page: {
  slug: string;
  title: string;
  type: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      slug: page.slug,
      title: page.title,
      type: page.type,
      content: page.content ?? "",
      frontmatter: page.frontmatter ?? {},
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`putPage(${page.slug}) failed: ${res.status} ${text}`);
  }
  console.log(`  ✓ Page created: ${page.slug}`);
}

async function getPage(slug: string): Promise<EnginePage | null> {
  const encoded = slug.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${encoded}`, {
    headers: HEADERS,
  });
  if (!res.ok) return null;
  return (await res.json()) as EnginePage;
}

async function triggerPipeline(caseSlug: string, partSlugs: string[]): Promise<{ job_id: string }> {
  const res = await fetch(`${ENGINE_URL}/api/legal-pipeline/trigger`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      case_slug: caseSlug,
      part_slugs: partSlugs,
      manual_overrides: {
        client: "Marjan Vasic",
        opponent: "Lifebrain GmbH / Doskar Apotheke",
        focus: "Irreguläre COVID-Testungen, Betrug, Amtsshaftung",
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pipeline trigger failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return { job_id: String(data.job_id ?? "unknown") };
}

async function getPipelineState(caseSlug: string): Promise<Record<string, unknown> | null> {
  const stateSlug = `pipeline/state-${caseSlug}`;
  const page = await getPage(stateSlug);
  if (!page) return null;
  // Try to parse the compiled_truth as JSON (full pipeline state)
  try {
    const raw =
      page.content || ((page as unknown as Record<string, unknown>).compiled_truth as string) || "";
    if (raw.trim().startsWith("{")) {
      return JSON.parse(raw);
    }
  } catch {
    // fall through to frontmatter
  }
  return page.frontmatter as Record<string, unknown>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Toni Gericht Pipeline-Run — Produktion (subsum.io)      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // ── Step 1: Read OCR files ──
  console.log("→ Step 1: Lese OCR-Daten...");
  const cleanedDoc = await Bun.file(`${OCR_DIR}/cleaned_key_documents.md`).text();
  const keyFacts = await Bun.file(`${OCR_DIR}/key_facts_summary.txt`).text();
  const analysisSummary = await Bun.file(`${OCR_DIR}/analysis_summary.txt`).text();

  const totalSize = cleanedDoc.length + keyFacts.length + analysisSummary.length;
  console.log(`  ✓ cleaned_key_documents.md: ${(cleanedDoc.length / 1024).toFixed(1)} KB`);
  console.log(`  ✓ key_facts_summary.txt: ${(keyFacts.length / 1024).toFixed(1)} KB`);
  console.log(`  ✓ analysis_summary.txt: ${(analysisSummary.length / 1024).toFixed(1)} KB`);
  console.log(`  Total: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log();

  // ── Step 2: Upload documents as pages ──
  console.log("→ Step 2: Lade Dokumente auf den Engine...");

  const partSlugs: string[] = [];

  // Document 1: Cleaned key documents
  const doc1Slug = "documents/toni-gericht-cleaned-key-docs";
  await putPage({
    slug: doc1Slug,
    title: "Toni Gericht — Bereinigte Schlüsseldokumente",
    type: "legal_document",
    content: cleanedDoc,
    frontmatter: {
      case_slug: CASE_SLUG,
      doc_type: "legal_document",
      source: "upload",
      source_format: "md",
      analysis_status: "ready",
      extraction_status: "ready",
      extraction_method: "ocr_cleaned",
    },
  });
  partSlugs.push(doc1Slug);

  // Document 2: Key facts summary
  const doc2Slug = "documents/toni-gericht-key-facts";
  await putPage({
    slug: doc2Slug,
    title: "Toni Gericht — Key Facts Summary",
    type: "legal_document",
    content: keyFacts,
    frontmatter: {
      case_slug: CASE_SLUG,
      doc_type: "legal_document",
      source: "upload",
      source_format: "txt",
      analysis_status: "ready",
      extraction_status: "ready",
      extraction_method: "ocr_cleaned",
    },
  });
  partSlugs.push(doc2Slug);

  // Document 3: Analysis summary
  const doc3Slug = "documents/toni-gericht-analysis-summary";
  await putPage({
    slug: doc3Slug,
    title: "Toni Gericht — Analysis Summary",
    type: "legal_document",
    content: analysisSummary,
    frontmatter: {
      case_slug: CASE_SLUG,
      doc_type: "legal_document",
      source: "upload",
      source_format: "txt",
      analysis_status: "ready",
      extraction_status: "ready",
      extraction_method: "ocr_cleaned",
    },
  });
  partSlugs.push(doc3Slug);

  console.log(`  ✓ ${partSlugs.length} Dokumente hochgeladen`);
  console.log();

  // ── Step 3: Create case page ──
  console.log("→ Step 3: Erstelle Case-Page...");
  await putPage({
    slug: CASE_SLUG,
    title: CASE_TITLE,
    type: "legal_case",
    content: `# ${CASE_TITLE}\n\n**Aktenzeichen:** 046 045 HV 29/24 y\n**Gericht:** LG Wien\n**Mandant:** Marjan Vasic\n**Gegner:** Lifebrain GmbH / Doskar Apotheke\n\n## Zusammenfassung\n\nIrreguläre COVID-Testungen in Apotheken, Betrugsverdacht, Amtsshaftung.\n`,
    frontmatter: {
      case_number: "046 045 HV 29/24 y",
      court: "LG Wien",
      client_name: "Marjan Vasic",
      opponent_name: "Lifebrain GmbH / Doskar Apotheke",
      legal_area: "Strafrecht / Amtsshaftung",
      jurisdiction: "at",
      verfahrenstyp: "straf",
      pipeline_status: "pending",
      documents: partSlugs.map((s) => ({ slug: s })),
    },
  });
  console.log(`  ✓ Case: ${CASE_SLUG}`);
  console.log();

  // ── Step 4: Trigger pipeline ──
  console.log("→ Step 4: Triggere Legal-Pipeline...");
  const startTime = Date.now();
  const triggerResult = await triggerPipeline(CASE_SLUG, partSlugs);
  console.log(`  ✓ Pipeline triggered — Job ID: ${triggerResult.job_id}`);
  console.log();

  // ── Step 5: Poll pipeline state ──
  console.log("→ Step 5: Tracke Pipeline-Verlauf...");
  console.log();

  let lastLayer = -1;
  let lastStatus = "";
  let pipelineDone = false;
  let pollCount = 0;
  const maxPolls = 120; // 120 × 10s = 20 min max

  while (!pipelineDone && pollCount < maxPolls) {
    await sleep(10_000);
    pollCount++;

    const state = await getPipelineState(CASE_SLUG);
    if (!state) {
      console.log(`  [${pollCount}] No state yet...`);
      continue;
    }

    const status = String(state.status ?? "unknown");
    const currentLayer = Number(state.current_layer ?? 0);
    const layers = state.layers as
      | Record<
          string,
          { status: string; started_at?: string; completed_at?: string; error?: string }
        >
      | undefined;

    if (status !== lastStatus || currentLayer !== lastLayer) {
      console.log(
        `  [${pollCount}] Status: ${status} | Layer: ${currentLayer} | ${new Date().toISOString()}`
      );

      if (layers) {
        for (const [layerNum, layerData] of Object.entries(layers).sort(
          (a, b) => Number(a[0]) - Number(b[0])
        )) {
          const layerStatus = layerData.status;
          const icon =
            layerStatus === "completed"
              ? "✓"
              : layerStatus === "running"
                ? "→"
                : layerStatus === "error"
                  ? "✗"
                  : "○";
          if (layerStatus !== "pending") {
            console.log(`         ${icon} Layer ${layerNum}: ${layerStatus}`);
            if (layerData.error) {
              console.log(`           Error: ${layerData.error}`);
            }
          }
        }
      }

      lastStatus = status;
      lastLayer = currentLayer;
    }

    if (status === "completed" || status === "error" || status === "failed") {
      pipelineDone = true;
    }
  }

  const elapsed = Date.now() - startTime;
  console.log();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Pipeline-Ergebnis                                        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // ── Step 6: Final state analysis ──
  const finalState = await getPipelineState(CASE_SLUG);
  if (finalState) {
    console.log("→ Final Pipeline State:");
    console.log(`  Status: ${finalState.status}`);
    console.log(`  Current Layer: ${finalState.current_layer}`);
    console.log(`  Duration: ${formatDuration(elapsed)}`);

    if (typeof finalState.cost_spent_usd === "number") {
      console.log(`  Cost: $${finalState.cost_spent_usd.toFixed(4)}`);
    }

    if (typeof finalState.total_duration_ms === "number") {
      console.log(`  Engine Duration: ${formatDuration(finalState.total_duration_ms)}`);
    }

    if (finalState.warnings && Array.isArray(finalState.warnings)) {
      console.log(`  Warnings: ${finalState.warnings.length}`);
      for (const w of finalState.warnings as string[]) {
        console.log(`    ⚠ ${w}`);
      }
    }

    if (finalState.linked_cases && Array.isArray(finalState.linked_cases)) {
      console.log(`  Linked Cases: ${(finalState.linked_cases as string[]).join(", ")}`);
    }

    if (finalState.cross_case_findings && Array.isArray(finalState.cross_case_findings)) {
      const findings = finalState.cross_case_findings as Array<Record<string, unknown>>;
      console.log(`  Cross-Case Findings: ${findings.length}`);
      for (const f of findings) {
        console.log(`    → [${f.type}] ${f.description}`);
      }
    }

    if (finalState.damage_overlap_warnings && Array.isArray(finalState.damage_overlap_warnings)) {
      const overlaps = finalState.damage_overlap_warnings as string[];
      console.log(`  Damage Overlap Warnings: ${overlaps.length}`);
      for (const o of overlaps) {
        console.log(`    ⚠ ${o}`);
      }
    }

    if (finalState.ensemble_verdict) {
      const verdict = finalState.ensemble_verdict as Record<string, unknown>;
      const consensus = verdict.consensus as Record<string, unknown>;
      if (consensus) {
        console.log(`  Ensemble Verdict:`);
        console.log(`    Total Score: ${consensus.total_score}`);
        console.log(`    Recommendation: ${consensus.recommendation}`);
        if (typeof consensus.narrative_coherence_score === "number") {
          console.log(`    Narrative Coherence: ${consensus.narrative_coherence_score}/100`);
        }
        if (typeof consensus.central_thesis === "string") {
          console.log(`    Central Thesis: ${consensus.central_thesis}`);
        }
        if (Array.isArray(consensus.coherence_violations)) {
          console.log(
            `    Coherence Violations: ${(consensus.coherence_violations as string[]).length}`
          );
        }
      }
    }

    if (typeof finalState.contradiction_findings === "number") {
      console.log(`  Contradiction Findings: ${finalState.contradiction_findings}`);
    }

    // Layer details
    const layers = finalState.layers as
      | Record<
          string,
          {
            status: string;
            started_at?: string;
            completed_at?: string;
            output_slugs?: string[];
            error?: string;
          }
        >
      | undefined;
    if (layers) {
      console.log();
      console.log("→ Layer Details:");
      for (const [layerNum, layerData] of Object.entries(layers).sort(
        (a, b) => Number(a[0]) - Number(b[0])
      )) {
        const outputs = layerData.output_slugs?.length ?? 0;
        console.log(`  Layer ${layerNum}: ${layerData.status} | ${outputs} outputs`);
        if (layerData.error) {
          console.log(`    Error: ${layerData.error}`);
        }
      }
    }
  } else {
    console.log("✗ Kein Pipeline-State gefunden!");
  }

  console.log();
  console.log("→ Dashboard-URL:");
  console.log(`  https://subsum.io/dashboard/judgements-db?case=${encodeURIComponent(CASE_SLUG)}`);
  console.log();
  console.log("Done. 🚀");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
