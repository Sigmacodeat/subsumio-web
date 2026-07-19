#!/usr/bin/env bun
/**
 * Fetch German Gesetzesmaterialien (BT-Drucksachen with full text) from the
 * official DIP API of the Deutscher Bundestag.
 *
 * Gesetzentwürfe carry the amtliche Begründung — the single most useful
 * interpretation aid after the statute text itself ("BT-Drs. 19/27873, S. 34"
 * is a citation courts accept). Drucksachen are amtliche Werke (§ 5 UrhG).
 *
 * API: https://search.dip.bundestag.de/api/v1 (OpenAPI: dip.bundestag.api.bund.dev)
 * An API key is REQUIRED. The previously published public key is expired
 * (verified 2026-07-18 → 401). Request one informally via mail:
 *   parlamentsdokumentation@bundestag.de  (or infoline.id3@bundestag.de)
 * Then export DIP_API_KEY=... or pass --key.
 *
 * Usage:
 *   bun scripts/fetch-de-gesetzesmaterialien.ts [--key KEY] [--since YYYY-MM-DD]
 *     [--target N] [--typ Gesetzentwurf]
 *
 * Output: law-corpus/de-materialien/btd-<wahlperiode>-<nummer>.md
 * Idempotent: existing files are skipped.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";
import { checkStaticCompliance } from "../src/core/legal/license-registry.ts";

const DIP_BASE = "https://search.dip.bundestag.de/api/v1";
const RATE_LIMIT_MS = 300;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const OUT_DIR = join(_corpusRoot, "de-materialien");

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const API_KEY = getArg("--key") ?? process.env.DIP_API_KEY ?? "";
const SINCE = getArg("--since"); // f.datum.start
const TARGET = Number(getArg("--target") ?? "0"); // 0 = alles
const DRUCKSACHETYP = getArg("--typ") ?? "Gesetzentwurf";

if (!API_KEY) {
  console.error(
    "DIP_API_KEY fehlt. Der öffentliche Schlüssel aus der API-Doku ist abgelaufen " +
      "(Stand 2026-07-18). Key formlos per Mail beantragen: " +
      "parlamentsdokumentation@bundestag.de — dann `export DIP_API_KEY=...` oder --key."
  );
  process.exit(1);
}

// Fail-closed license gate — throws if the registry does not allow API use.
const terms = checkStaticCompliance("law-de-materialien", "api");
console.log(`[license] ${terms.source_name}: ${terms.license_type} — API-Nutzung erlaubt`);

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `ApiKey ${API_KEY}`,
          "User-Agent": "Subsumio-Legal-Import/1.0 (Gesetzesmaterialien; amtliche Werke)",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

interface DipDrucksacheText {
  id: string;
  dokumentart: string;
  drucksachetyp?: string;
  dokumentnummer?: string; // "19/27873"
  wahlperiode?: number;
  herausgeber?: string; // "BT" | "BR"
  datum?: string; // YYYY-MM-DD
  titel?: string;
  fundstelle?: { pdf_url?: string };
  text?: string;
}

function slugFor(d: DipDrucksacheText): string {
  const nr = (d.dokumentnummer ?? d.id).replace(/\//g, "-").toLowerCase();
  const org = (d.herausgeber ?? "bt").toLowerCase();
  return `${org}d-${nr}`;
}

function loadExisting(): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(OUT_DIR)) return ids;
  for (const f of readdirSync(OUT_DIR)) {
    if (f.endsWith(".md")) ids.add(f.replace(/\.md$/, ""));
  }
  return ids;
}

function writeDoc(d: DipDrucksacheText): void {
  const slug = slugFor(d);
  const citation = `${d.herausgeber === "BR" ? "BR" : "BT"}-Drs. ${d.dokumentnummer ?? d.id}`;
  const fm = {
    title: `${citation} — ${(d.titel ?? "").slice(0, 200)}`,
    type: "materialien",
    jurisdiction: "de",
    doc_type: d.drucksachetyp ?? d.dokumentart,
    citation,
    wahlperiode: d.wahlperiode ?? null,
    dokumentnummer: d.dokumentnummer ?? null,
    herausgeber: d.herausgeber ?? null,
    version_date: d.datum ?? null,
    retrieved_at: new Date().toISOString().slice(0, 10),
    source: "dip-bundestag",
    source_url: d.fundstelle?.pdf_url ?? `https://dip.bundestag.de/drucksache/${d.id}`,
    license:
      "Amtliches Werk, § 5 UrhG (gemeinfrei). Quelle: DIP, Deutscher Bundestag. " +
      "Zitierweise: " +
      citation +
      ".",
  };
  const body = (d.text ?? "").trim();
  const md = `---\n${yamlDump(fm)}---\n\n# ${citation}: ${d.titel ?? ""}\n\n${body}\n`;
  writeFileSync(join(OUT_DIR, `${slug}.md`), md, "utf8");
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const existing = loadExisting();
  console.log(
    `[dip] Start: typ=${DRUCKSACHETYP} since=${SINCE ?? "alle"} vorhandene Dateien=${existing.size}`
  );

  let cursor = "";
  let written = 0;
  let skipped = 0;
  let empty = 0;

  for (;;) {
    const params = new URLSearchParams();
    params.set("f.drucksachetyp", DRUCKSACHETYP);
    if (SINCE) params.set("f.datum.start", SINCE);
    if (cursor) params.set("cursor", cursor);
    const url = `${DIP_BASE}/drucksache-text?${params.toString()}`;
    const res = await fetchWithRetry(url);
    if (res.status === 401) {
      console.error(
        "[dip] 401 — API-Key ungültig/abgelaufen. Neuen Key beantragen (siehe Header)."
      );
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`[dip] HTTP ${res.status} — Abbruch. Bisher geschrieben: ${written}`);
      process.exit(1);
    }
    const data = (await res.json()) as {
      documents?: DipDrucksacheText[];
      cursor?: string;
      numFound?: number;
    };
    const docs = data.documents ?? [];
    if (docs.length === 0) break;

    for (const d of docs) {
      const slug = slugFor(d);
      if (existing.has(slug)) {
        skipped++;
        continue;
      }
      if (!d.text || d.text.trim().length < 500) {
        empty++;
        continue; // Stub ohne Volltext — nicht importieren (fail-closed content)
      }
      writeDoc(d);
      existing.add(slug);
      written++;
      if (TARGET > 0 && written >= TARGET) {
        console.log(`[dip] Target ${TARGET} erreicht. written=${written} skipped=${skipped}`);
        return;
      }
    }

    console.log(
      `[dip] Seite verarbeitet: written=${written} skipped=${skipped} leer=${empty} / total=${data.numFound ?? "?"}`
    );
    const next = data.cursor ?? "";
    if (!next || next === cursor) break; // DIP signalisiert Ende durch identischen Cursor
    cursor = next;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`[dip] Fertig. geschrieben=${written} übersprungen=${skipped} ohne Text=${empty}`);
}

main().catch((err) => {
  console.error("[dip] Fataler Fehler:", err);
  process.exit(1);
});
