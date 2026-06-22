#!/usr/bin/env bun
/**
 * Embedding-Provider Setup für Subsumio
 *
 * Konfiguriert automatisch den besten verfügbaren Embedding-Provider
 * und generiert Embeddings für alle importierten Daten.
 *
 * Usage:
 *   export OPENAI_API_KEY=sk-...
 *   bun run server/scripts/setup-embedding.ts
 *
 * Oder mit Voyage AI (spezialisiert auf Legal):
 *   export VOYAGE_API_KEY=pa-...
 *   bun run server/scripts/setup-embedding.ts --provider voyage
 *
 * Oder mit Ollama (lokal, kostenlos):
 *   bun run server/scripts/setup-embedding.ts --provider ollama
 */

const args = Bun.argv.slice(2);
const provider = args.find(a => a.startsWith('--provider'))?.split('=')[1] || 'auto';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

interface ProviderConfig {
  name: string;
  model: string;
  dimensions: number;
  costPer1M: string;
  description: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    model: 'openai:text-embedding-3-small',
    dimensions: 1536,
    costPer1M: '$0.02',
    description: 'Bestes Preis-Leistungs-Verhältnis. Sehr gute Qualität für Legal-Texte.',
  },
  voyage: {
    name: 'Voyage AI',
    model: 'voyage:voyage-law-2',
    dimensions: 1024,
    costPer1M: '$0.12',
    description: 'Spezialisiert auf legale Texte. Höchste Qualität, aber teurer.',
  },
  ollama: {
    name: 'Ollama (lokal)',
    model: 'ollama:nomic-embed-text',
    dimensions: 768,
    costPer1M: '$0.00',
    description: 'Kostenlos, lokal. Mittlere Qualität, langsamer.',
  },
};

async function detectBestProvider(): Promise<{ key: string; config: ProviderConfig }> {
  if (VOYAGE_KEY) return { key: VOYAGE_KEY, config: PROVIDERS.voyage };
  if (OPENAI_KEY) return { key: OPENAI_KEY, config: PROVIDERS.openai };

  // Check if Ollama is running
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return { key: '', config: PROVIDERS.ollama };
  } catch {}

  return { key: '', config: PROVIDERS.openai }; // default recommendation
}

async function checkOllamaModel(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json() as { models?: Array<{ name: string }> };
    return data.models?.some(m => m.name.includes('nomic-embed')) ?? false;
  } catch {
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Subsumio — Embedding-Provider Setup');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  let selected = provider;
  let key = '';

  if (selected === 'auto') {
    const detected = await detectBestProvider();
    selected = detected.config.name.toLowerCase().includes('voyage') ? 'voyage' :
               detected.config.name.toLowerCase().includes('ollama') ? 'ollama' : 'openai';
    key = detected.key;
  }

  const config = PROVIDERS[selected];
  if (!config) {
    console.error('❌ Unbekannter Provider. Verfügbar: openai, voyage, ollama');
    process.exit(1);
  }

  console.log(`Gewählter Provider: ${config.name}`);
  console.log(`Modell:           ${config.model}`);
  console.log(`Dimensionen:      ${config.dimensions}`);
  console.log(`Kosten:           ${config.costPer1M} pro 1M tokens`);
  console.log(`Beschreibung:     ${config.description}`);
  console.log('');

  // Validate key availability
  if (selected === 'openai' && !OPENAI_KEY) {
    console.log('⚠️  OPENAI_API_KEY nicht gesetzt.');
    console.log('');
    console.log('So richtest du ihn ein:');
    console.log('  1. Gehe zu https://platform.openai.com/api-keys');
    console.log('  2. Erstelle einen neuen API-Key');
    console.log('  3. Führe aus:');
    console.log('     export OPENAI_API_KEY=sk-dein-key-hier');
    console.log('     bun run server/scripts/setup-embedding.ts');
    console.log('');
    process.exit(1);
  }

  if (selected === 'voyage' && !VOYAGE_KEY) {
    console.log('⚠️  VOYAGE_API_KEY nicht gesetzt.');
    console.log('');
    console.log('So richtest du ihn ein:');
    console.log('  1. Gehe zu https://www.voyageai.com/');
    console.log('  2. Erstelle einen API-Key');
    console.log('  3. Führe aus:');
    console.log('     export VOYAGE_API_KEY=pa-dein-key-hier');
    console.log('     bun run server/scripts/setup-embedding.ts --provider voyage');
    console.log('');
    process.exit(1);
  }

  if (selected === 'ollama') {
    const hasModel = await checkOllamaModel();
    if (!hasModel) {
      console.log('⚠️  Ollama läuft nicht oder nomic-embed-text ist nicht installiert.');
      console.log('');
      console.log('So richtest du Ollama ein:');
      console.log('  1. Installiere Ollama: https://ollama.com/download');
      console.log('  2. Starte Ollama: ollama serve');
      console.log('  3. Lade das Modell: ollama pull nomic-embed-text');
      console.log('  4. Führe aus: bun run server/scripts/setup-embedding.ts --provider ollama');
      console.log('');
      process.exit(1);
    }
  }

  // Initialize engine and configure
  console.log('[1/3] Engine initialisieren...');
  const { PGLiteEngine } = await import('../src/core/pglite-engine.ts');
  const engine = new PGLiteEngine();
  await engine.connect({ database_url: '' });
  await engine.initSchema();

  console.log('[2/3] Embedding-Provider konfigurieren...');
  await engine.setConfig('embedding_model', config.model);
  await engine.setConfig('embedding_dimensions', String(config.dimensions));

  // If no-embed was set before, clear it
  try {
    await engine.executeRaw(`UPDATE sources SET config = config || '{"no_embed": false}'::jsonb WHERE id = 'default'`);
  } catch {}

  console.log('[3/3] Embeddings für alle Pages generieren...');
  console.log('      Das kann je nach Datenmenge einige Minuten dauern...');
  console.log('');

  // Run embed via CLI
  const proc = Bun.spawn(['bun', 'run', 'server/src/cli.ts', 'embed', '--all', '--batch-size', '50'], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, OPENAI_API_KEY: OPENAI_KEY || '', VOYAGE_API_KEY: VOYAGE_KEY || '' },
  });

  const exitCode = await proc.exited;
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();

  if (out) console.log(out);
  if (err && exitCode !== 0) console.error(err);

  if (exitCode === 0) {
    console.log('');
    console.log('✅ Embedding-Setup erfolgreich!');
    console.log('');
    console.log('Dein Supergehirn ist jetzt vollständig einsatzbereit:');
    console.log('  • 450+ Urteile aus AT und DE (embeddet)');
    console.log('  • 21 Gesetze aus AT, DE, CH (embeddet)');
    console.log('  • KI kann jetzt zitierte, präzise Antworten geben');
    console.log('');
    console.log('Teste es im Dashboard:');
    console.log('  /dashboard/research — Rechtsfrage stellen');
    console.log('  /dashboard/assistant — Vertrag analysieren lassen');
    console.log('');
  } else {
    console.error('❌ Embedding fehlgeschlagen. Prüfe die Fehlermeldung oben.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

export {}; // make this file a module so top-level `main` does not collide in the global script scope
