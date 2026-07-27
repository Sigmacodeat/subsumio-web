#!/usr/bin/env bun
/**
 * verify-chunks.ts — sample legal pages and compare persisted chunks to a
 * fresh re-chunk of the original on-disk markdown.
 *
 * This checks that no chunks are missing, reordered, or split differently
 * than the deterministic legal chunkers produce.
 */

import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { parseMarkdown } from "../src/core/markdown.ts";
import { chunkLegalSection } from "../src/core/chunkers/legal-statute.ts";
import { chunkLegalDecision } from "../src/core/chunkers/legal-decision.ts";
import { isLegalPage, isCourtDecisionPage } from "../src/core/embedding-context.ts";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";

const SOURCE_TO_DIR: Record<string, string> = {
  "law-at-bmerl": "at-bmerl",
  "law-at-avsv": "at-avsv",
  "law-at-avn": "at-avn",
  "law-at-spg": "at-spg",
  "law-at-kmger": "at-kmger",
  "law-at-bezirke": "at-bezirke",
  "law-at-gemeinden": "at-gemeinden",
  "law-at-judikatur-umse": "at-judikatur-umse",
  "law-at-judikatur-gbk": "at-judikatur-gbk",
  "law-at-judikatur-pvak": "at-judikatur-pvak",
  "law-at-judikatur-dsk": "at-judikatur-dsk",
  "law-at-judikatur-dok": "at-judikatur-dok",
  "law-at-judikatur-ubas": "at-judikatur-ubas",
  "law-at-judikatur-vfgh": "at-judikatur-vfgh",
  "law-at-judikatur-uvs": "at-judikatur-uvs",
  "law-at-judikatur-asylgh": "at-judikatur-asylgh",
  "law-at-judikatur-lvwg": "at-judikatur-lvwg",
  "law-at": "at",
  "law-at-landesrecht": "at-landesrecht",
  "law-at-staatsvertraege": "at-staatsvertraege",
  "law-at-literatur": "at-literatur",
};

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function buildStatuteLabel(m: any): string {
  const ref = m.paragraph_ref ? `§ ${m.paragraph_ref}` : "Norm";
  const abs = m.absatz ? ` Abs. ${m.absatz}` : "";
  return `${m.statute_abbr || "unbekannt"} ${ref}${abs}`.trim();
}

function buildStatuteLabels(m: any): { type: string; text: string; display: string }[] {
  const labels: { type: string; text: string; display: string }[] = [];
  if (m.statute_abbr && m.paragraph_ref) {
    labels.push({
      type: "statute",
      text: `${m.statute_abbr} § ${m.paragraph_ref}`,
      display: `${m.statute_abbr} § ${m.paragraph_ref}`,
    });
    if (m.absatz) {
      labels.push({
        type: "paragraph",
        text: `${m.statute_abbr} § ${m.paragraph_ref} Abs. ${m.absatz}`,
        display: `${m.statute_abbr} § ${m.paragraph_ref} Abs. ${m.absatz}`,
      });
    }
  } else if (m.statute_abbr) {
    labels.push({ type: "statute", text: m.statute_abbr, display: m.statute_abbr });
  }
  return labels;
}

function buildDecisionLabels(m: any): { type: string; text: string; display: string }[] {
  const labels: { type: string; text: string; display: string }[] = [];
  if (m.court && m.case_number) {
    labels.push({
      type: "court_case",
      text: `${m.court} ${m.case_number}`,
      display: `${m.court} ${m.case_number}`,
    });
  }
  if (m.ecli) {
    labels.push({ type: "ecli", text: m.ecli, display: m.ecli });
  }
  return labels;
}

async function main() {
  const sampleArg = process.argv.find((a) => a.startsWith("--samples="));
  const SAMPLES = sampleArg ? parseInt(sampleArg.split("=")[1], 10) : 50;

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));

  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  // Pick SAMPLES random pages from the imported AT legal sources
  const pageRows = await engine.executeRaw<{
    id: number;
    source_id: string;
    slug: string;
    source_path: string | null;
  }>(
    `SELECT id, source_id, slug, source_path
     FROM pages
     WHERE source_id = ANY($1)
     ORDER BY random()
     LIMIT $2`,
    [Object.keys(SOURCE_TO_DIR), SAMPLES]
  );

  let checked = 0;
  let ok = 0;
  const mismatches: string[] = [];

  for (const page of pageRows) {
    const diskDir = SOURCE_TO_DIR[page.source_id];
    if (!diskDir) continue;

    const slugBase = basename(page.slug);
    const diskPath = join(process.cwd(), "law-corpus", diskDir, `${slugBase}.md`);

    if (!existsSync(diskPath)) {
      mismatches.push(`[${page.source_id}/${page.slug}] missing disk file ${diskPath}`);
      continue;
    }

    const content = readFileSync(diskPath, "utf-8");
    const parsed = parseMarkdown(content, page.slug + ".md");

    const courtDecision =
      isCourtDecisionPage(parsed.frontmatter) ||
      parsed.type === "court_decision" ||
      parsed.type === "judgement";
    const legalPage =
      isLegalPage(parsed.frontmatter) || parsed.type === "law" || parsed.type === "statute";

    if (!courtDecision && !legalPage) {
      continue; // skip non-legal pages
    }

    // Re-chunk exactly like import-file.ts
    let expectedChunks: { text: string; metadata: any }[] = [];
    if (courtDecision) {
      expectedChunks = chunkLegalDecision(parsed.compiled_truth, {
        court: String(parsed.frontmatter.court ?? ""),
        case_number: String(parsed.frontmatter.case_number ?? ""),
        decision_date: String(parsed.frontmatter.decision_date ?? ""),
        ecli: String(parsed.frontmatter.ecli ?? ""),
        legal_area: String(parsed.frontmatter.legal_area ?? ""),
        jurisdiction: String(parsed.frontmatter.jurisdiction ?? ""),
      }) as any;
    } else if (legalPage) {
      expectedChunks = chunkLegalSection(parsed.compiled_truth, {
        paragraph_ref: String(parsed.frontmatter.paragraph ?? ""),
        statute_abbr: String(parsed.frontmatter.abbreviation ?? ""),
        jurisdiction: String(parsed.frontmatter.jurisdiction ?? ""),
      }) as any;
    }

    // Fetch persisted compiled_truth chunks
    const dbChunks = await engine.executeRaw<{
      id: number;
      chunk_index: number;
      chunk_text: string;
      chunk_source: string;
      document_type: string | null;
      statute_abbr: string | null;
      paragraph_ref: string | null;
      absatz: string | null;
      chunk_role: string | null;
      court: string | null;
      case_number: string | null;
      ecli: string | null;
      decision_date: string | null;
      legal_area: string | null;
      canonical_label: string | null;
    }>(
      `SELECT id, chunk_index, chunk_text, chunk_source, document_type,
              statute_abbr, paragraph_ref, absatz, chunk_role, court,
              case_number, ecli, decision_date, legal_area, canonical_label
       FROM content_chunks
       WHERE page_id = $1 AND chunk_source = 'compiled_truth'
       ORDER BY chunk_index`,
      [page.id]
    );

    checked++;

    // 1. count check
    if (dbChunks.length !== expectedChunks.length) {
      mismatches.push(
        `[${page.source_id}/${page.slug}] chunk count mismatch: db=${dbChunks.length} expected=${expectedChunks.length}`
      );
      continue;
    }

    // 2. per-chunk content + metadata check
    let pageOk = true;
    for (let i = 0; i < expectedChunks.length; i++) {
      const exp = expectedChunks[i];
      const db = dbChunks[i];
      if (normalize(db.chunk_text) !== normalize(exp.text)) {
        mismatches.push(
          `[${page.source_id}/${page.slug}] chunk ${i} text mismatch (len db=${db.chunk_text.length}, expected=${exp.text.length})`
        );
        pageOk = false;
      }
      const m = exp.metadata;
      if (courtDecision) {
        if (db.document_type !== "decision") {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} document_type expected 'decision', got '${db.document_type}'`
          );
          pageOk = false;
        }
        if ((db.court ?? "") !== (m.court ?? "")) {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} court mismatch db=${db.court} expected=${m.court}`
          );
          pageOk = false;
        }
        if ((db.case_number ?? "") !== (m.case_number ?? "")) {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} case_number mismatch db=${db.case_number} expected=${m.case_number}`
          );
          pageOk = false;
        }
      } else {
        if (db.document_type !== "statute") {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} document_type expected 'statute', got '${db.document_type}'`
          );
          pageOk = false;
        }
        if ((db.statute_abbr ?? "") !== (m.statute_abbr ?? "")) {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} statute_abbr mismatch db=${db.statute_abbr} expected=${m.statute_abbr}`
          );
          pageOk = false;
        }
        if ((db.paragraph_ref ?? "") !== (m.paragraph_ref ?? "")) {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} paragraph_ref mismatch db=${db.paragraph_ref} expected=${m.paragraph_ref}`
          );
          pageOk = false;
        }
      }

      const expectedCanonical = courtDecision
        ? m.court && m.case_number
          ? `${m.court} ${m.case_number}`
          : undefined
        : buildStatuteLabel(m);
      if ((db.canonical_label ?? "") !== (expectedCanonical ?? "")) {
        mismatches.push(
          `[${page.source_id}/${page.slug}] chunk ${i} canonical_label mismatch db=${db.canonical_label} expected=${expectedCanonical}`
        );
        pageOk = false;
      }
    }

    // 3. label check
    if (pageOk) {
      const chunkIds = dbChunks.map((c) => c.id);
      const dbLabels = await engine.executeRaw<{
        chunk_id: number;
        label_type: string;
        label_text: string;
        label_display: string;
      }>(
        `SELECT chunk_id, label_type, label_text, label_display
         FROM content_chunk_labels
         WHERE chunk_id = ANY($1)
         ORDER BY chunk_id, label_type, label_text`,
        [chunkIds]
      );

      const labelsByChunk = new Map<number, { type: string; text: string; display: string }[]>();
      for (const l of dbLabels) {
        const arr = labelsByChunk.get(l.chunk_id) ?? [];
        arr.push({ type: l.label_type, text: l.label_text, display: l.label_display });
        labelsByChunk.set(l.chunk_id, arr);
      }

      for (let i = 0; i < expectedChunks.length; i++) {
        const exp = expectedChunks[i];
        const chunkId = dbChunks[i].id;
        const expectedLabels = courtDecision
          ? buildDecisionLabels(exp.metadata)
          : buildStatuteLabels(exp.metadata);
        const actual = labelsByChunk.get(chunkId) ?? [];
        const expectedSorted = [...expectedLabels].sort(
          (a, b) => a.type.localeCompare(b.type) || a.text.localeCompare(b.text)
        );
        const actualSorted = [...actual].sort(
          (a, b) => a.type.localeCompare(b.type) || a.text.localeCompare(b.text)
        );

        if (expectedSorted.length !== actualSorted.length) {
          mismatches.push(
            `[${page.source_id}/${page.slug}] chunk ${i} label count mismatch db=${actualSorted.length} expected=${expectedSorted.length}`
          );
          pageOk = false;
        } else {
          for (let j = 0; j < expectedSorted.length; j++) {
            if (
              expectedSorted[j].type !== actualSorted[j].type ||
              expectedSorted[j].text !== actualSorted[j].text
            ) {
              mismatches.push(
                `[${page.source_id}/${page.slug}] chunk ${i} label[${j}] mismatch db=${actualSorted[j].type}/${actualSorted[j].text} expected=${expectedSorted[j].type}/${expectedSorted[j].text}`
              );
              pageOk = false;
            }
          }
        }
      }
    }

    if (pageOk) ok++;
  }

  console.log(`Checked ${checked} pages (${pageRows.length} sampled).`);
  console.log(`Perfect matches: ${ok}/${checked}`);
  console.log(`Mismatches: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.log("\n--- Mismatches ---");
    for (const m of mismatches.slice(0, 30)) {
      console.log(m);
    }
    if (mismatches.length > 30) {
      console.log(`... and ${mismatches.length - 30} more`);
    }
  }
  process.exit(mismatches.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
