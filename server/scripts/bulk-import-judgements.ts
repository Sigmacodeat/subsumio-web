#!/usr/bin/env bun
/**
 * Bulk-Import Script für Rechtsprechungsdaten.
 *
 * Lädt systematisch historische Urteile aus allen verfügbaren Quellen
 * und importiert sie in die Brain-Datenbank. Automatisches Chunking
 * + Embedding via importFromContent. Resume-Logik via Cursor-Datei.
 *
 * Usage:
 *   bun run server/scripts/bulk-import-judgements.ts --source all --years 5
 *   bun run server/scripts/bulk-import-judgements.ts --source ris-ogd --years 10
 *   bun run server/scripts/bulk-import-judgements.ts --source openlegaldata --years 3
 *   bun run server/scripts/bulk-import-judgements.ts --source eur-lex --years 5
 *   bun run server/scripts/bulk-import-judgements.ts --resume-from cursor.json
 *
 * Options:
 *   --source       Quelle: all | ris-ogd | openlegaldata | eur-lex
 *   --years        Wie viele Jahre zurück (default: 5)
 *   --batch-size   Urteile pro Batch (default: 100)
 *   --resume-from  Cursor-Datei für Fortsetzung
 *   --dry-run      Nur anzeigen, nicht importieren
 *   --no-embed     Keine Embedding-Generierung (schneller)
 */

import { parseArgs } from 'util';
import { LegalJudgementsConnector } from '../src/core/ingestion/connectors/legal-judgements.ts';
import { EurLexConnector } from '../src/core/ingestion/connectors/eur-lex.ts';
import type { BrainEngine } from '../src/core/engine.ts';
import { PGLiteEngine } from '../src/core/pglite-engine.ts';
import { importFromContent } from '../src/core/import-file.ts';
import type { IngestionEvent } from '../src/core/ingestion/types.ts';
import type { ConnectorItem } from '../src/core/ingestion/connectors/base.ts';
import { loadConfig } from '../src/core/config.ts';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: 'string', default: 'all' },
    years: { type: 'string', default: '5' },
    'batch-size': { type: 'string', default: '100' },
    'resume-from': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'no-embed': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Bulk Import für Rechtsprechungsdaten

Usage:
  bun run server/scripts/bulk-import-judgements.ts [options]

Options:
  --source       Quelle: all | ris-ogd | openlegaldata | eur-lex (default: all)
  --years        Jahre zurück (default: 5)
  --batch-size   Batch-Größe (default: 100)
  --resume-from  Cursor-Datei für Fortsetzung
  --dry-run      Nur anzeigen, nicht importieren
  --no-embed     Keine Embedding-Generierung (schneller)
  --help         Diese Hilfe

Beispiele:
  bun run scripts/bulk-import-judgements.ts --source ris-ogd --years 10
  bun run scripts/bulk-import-judgements.ts --source all --years 3 --batch-size 50
  bun run scripts/bulk-import-judgements.ts --source eur-lex --dry-run
`);
  process.exit(0);
}

const SOURCE = values.source as string;
const YEARS = parseInt(String(values.years), 10) || 5;
const BATCH_SIZE = parseInt(String(values['batch-size']), 10) || 100;
const RESUME_FILE = (values['resume-from'] as string | undefined) || 'bulk-import-cursor.json';
const DRY_RUN = values['dry-run'] as boolean;
const NO_EMBED = values['no-embed'] as boolean;

interface ImportStats {
  source: string;
  fetched: number;
  imported: number;
  skipped: number;
  errors: number;
  duration: number;
}

interface CursorState {
  risOgd?: string;
  openlegaldata?: string;
  eurLex?: string;
  completedSources: string[];
}

async function loadCursor(): Promise<CursorState> {
  try {
    const file = Bun.file(RESUME_FILE);
    if (!await file.exists()) return { completedSources: [] };
    const raw = await file.text();
    return JSON.parse(raw) as CursorState;
  } catch {
    return { completedSources: [] };
  }
}

async function saveCursor(state: CursorState) {
  await Bun.write(RESUME_FILE, JSON.stringify(state, null, 2));
}

const importedSlugs = new Set<string>();

async function importSource(
  sourceName: string,
  connector: { fetchDelta: (cursor?: string) => Promise<{ items: ConnectorItem[]; nextCursor?: string }>; toIngestionEvent: (item: ConnectorItem) => Promise<IngestionEvent> },
  engine: BrainEngine,
  cursor?: string,
): Promise<ImportStats> {
  console.log(`\n[${sourceName}] Starte Import...`);
  const startTime = Date.now();

  const { items, nextCursor } = await connector.fetchDelta(cursor);
  console.log(`[${sourceName}] ${items.length} Urteile gefetched.`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);
    console.log(`[${sourceName}] Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    for (const item of batch) {
      try {
        const event = await connector.toIngestionEvent(item);
        const slug = String((event.metadata as Record<string, unknown> | undefined)?.slug ?? '');
        if (!slug) {
          skipped++;
          continue;
        }

        if (importedSlugs.has(slug)) {
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`  [DRY-RUN] Would import: ${slug}`);
          importedSlugs.add(slug);
          imported++;
          continue;
        }

        await importFromContent(engine, slug, event.content, { noEmbed: NO_EMBED });
        importedSlugs.add(slug);
        imported++;
      } catch (e) {
        errors++;
        console.error(`  [${sourceName}] Fehler: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const cursorState = await loadCursor();
    if (sourceName === 'ris-ogd') cursorState.risOgd = nextCursor ?? cursorState.risOgd;
    if (sourceName === 'openlegaldata') cursorState.openlegaldata = nextCursor ?? cursorState.openlegaldata;
    if (sourceName === 'eur-lex') cursorState.eurLex = nextCursor ?? cursorState.eurLex;
    await saveCursor(cursorState);
  }

  const duration = Date.now() - startTime;
  console.log(`[${sourceName}] Fertig: ${imported} importiert, ${skipped} übersprungen, ${errors} Fehler in ${(duration / 1000).toFixed(1)}s`);

  return { source: sourceName, fetched: items.length, imported, skipped, errors, duration };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SigmaBrain — Bulk Rechtsprechungs-Import');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Quelle: ${SOURCE}`);
  console.log(`Zeitraum: letzte ${YEARS} Jahre`);
  console.log(`Batch-Größe: ${BATCH_SIZE}`);
  console.log(`Dry-Run: ${DRY_RUN ? 'JA' : 'Nein'}`);
  console.log(`No-Embed: ${NO_EMBED ? 'JA' : 'Nein'}`);
  console.log(`Resume-File: ${RESUME_FILE}`);
  console.log('');

  const sinceMs = Date.now() - YEARS * 365 * 24 * 60 * 60 * 1000;
  const defaultCursor = String(sinceMs);

  const cursorState = await loadCursor();

  const gbrainConfig = loadConfig();
  const engine = new PGLiteEngine();
  await engine.connect({ database_path: gbrainConfig?.database_path });
  await engine.initSchema();

  const results: ImportStats[] = [];

  if (SOURCE === 'all' || SOURCE === 'ris-ogd') {
    if (!cursorState.completedSources.includes('ris-ogd')) {
      const conn = new LegalJudgementsConnector({
        filters: { jurisdiction: 'at', max_detail_fetches: '50' },
      });
      const stats = await importSource('ris-ogd', conn, engine, cursorState.risOgd ?? defaultCursor);
      results.push(stats);
      if (!DRY_RUN) cursorState.completedSources.push('ris-ogd');
    } else {
      console.log('[ris-ogd] Bereits abgeschlossen (Resume).');
    }
  }

  if (SOURCE === 'all' || SOURCE === 'openlegaldata') {
    if (!cursorState.completedSources.includes('openlegaldata')) {
      const conn = new LegalJudgementsConnector({
        filters: { jurisdiction: 'de', max_detail_fetches: '50' },
      });
      const stats = await importSource('openlegaldata', conn, engine, cursorState.openlegaldata ?? defaultCursor);
      results.push(stats);
      if (!DRY_RUN) cursorState.completedSources.push('openlegaldata');
    } else {
      console.log('[openlegaldata] Bereits abgeschlossen (Resume).');
    }
  }

  if (SOURCE === 'all' || SOURCE === 'eur-lex') {
    if (!cursorState.completedSources.includes('eur-lex')) {
      const conn = new EurLexConnector({
        filters: { query: 'court ruling OR preliminary ruling OR case law', max_pages: '5', max_detail_fetches: '25' },
      });
      const stats = await importSource('eur-lex', conn, engine, cursorState.eurLex ?? defaultCursor);
      results.push(stats);
      if (!DRY_RUN) cursorState.completedSources.push('eur-lex');
    } else {
      console.log('[eur-lex] Bereits abgeschlossen (Resume).');
    }
  }

  // CH-Gesetze als Markdown importieren
  if (SOURCE === 'all' || SOURCE === 'ch') {
    console.log('\n[CH-Gesetze] Importiere OR, ZGB, StGB...');
    const chFiles = ['law-corpus/ch/or.md', 'law-corpus/ch/zgb.md', 'law-corpus/ch/stgb.md'];
    for (const file of chFiles) {
      try {
        const content = await Bun.file(file).text();
        const slug = file.replace('law-corpus/ch/', 'legal/statutes/ch/').replace('.md', '');
        await importFromContent(engine, slug, content, { noEmbed: NO_EMBED });
        console.log(`  ✅ ${slug}`);
      } catch (e) {
        console.error(`  ❌ ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Embedding für alle neuen Pages
  if (!NO_EMBED && !DRY_RUN) {
    console.log('\n[Embedding] Generiere Embeddings für alle importierten Pages...');
    try {
      // @ts-expect-error — internal API
      await engine.embedStale?.({ batchSize: 50 });
      console.log('  ✅ Embeddings erstellt');
    } catch {
      console.log('  ⚠️  Embedding übersprungen (engine.embedStale nicht verfügbar)');
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ZUSAMMENFASSUNG');
  console.log('═══════════════════════════════════════════════════════════');
  const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
  const totalImported = results.reduce((s, r) => s + r.imported, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const totalDuration = results.reduce((s, r) => s + r.duration, 0);

  for (const r of results) {
    console.log(`${r.source.padEnd(20)} | ${r.imported.toString().padStart(5)}/${r.fetched.toString().padStart(5)} | ${r.skipped} skip | ${r.errors} err | ${(r.duration / 1000).toFixed(1)}s`);
  }
  console.log('───────────────────────────────────────────────────────────');
  console.log(`${'GESAMT'.padEnd(20)} | ${totalImported.toString().padStart(5)}/${totalFetched.toString().padStart(5)} | ${totalSkipped} skip | ${totalErrors} err | ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('');

  if (!DRY_RUN) {
    await saveCursor(cursorState);
    console.log(`Cursor gespeichert nach: ${RESUME_FILE}`);
    if (NO_EMBED) {
      console.log('');
      console.log('Embedding wurde übersprungen (--no-embed). Nächster Schritt:');
      console.log('  bun run server/scripts/auto-embed-pending.ts');
    } else {
      console.log('Alle Urteile wurden importiert + embedded (auto-chunk + auto-embed).');
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
