#!/usr/bin/env bun
/**
 * Schema einer Postgres-Datenbank hochfahren — sonst nichts.
 *
 * WARUM NICHT `gbrain init`: Das ist ein Einrichtungs-Assistent, der
 * `~/.gbrain/config.json` schreibt. Die zeigt auf die produktive Datenbank;
 * ein Lauf gegen eine neue DB würde sie umbiegen und die laufende Installation
 * auf die leere Datenbank zeigen lassen. Hier wird ausschließlich
 * `engine.initSchema()` aufgerufen — die MIGRATIONS-Kette bis LATEST_VERSION,
 * ohne Assistent, ohne Konfigurationsdatei anzufassen.
 *
 * Zieldatenbank kommt über GBRAIN_DATABASE_URL aus der Umgebung.
 *
 *   GBRAIN_DATABASE_URL=postgres://…/subsumio_law_v2 \
 *     bun server/scripts/init-schema-only.ts
 */

const url = process.env.GBRAIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("GBRAIN_DATABASE_URL fehlt.");
  process.exit(1);
}
console.log(`Schema-Init gegen ${url.replace(/:\/\/[^@]*@/, "://***:***@")}`);

const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
const { createEngine } = await import("../src/core/engine-factory.ts");
const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
const { configureGateway } = await import("../src/core/ai/gateway.ts");
const { LATEST_VERSION } = await import("../src/core/migrate.ts");

const cfg = loadConfig();
if (!cfg) throw new Error("Keine Engine-Konfiguration auflösbar.");

// initSchema() löst die Embedding-Dimension über das Gateway auf — ohne
// konfiguriertes Gateway fällt es auf veraltete Vorgaben zurück.
configureGateway(buildGatewayConfig(cfg));

const engine = await createEngine(toEngineConfig(cfg));
await engine.connect(toEngineConfig(cfg));

console.log(`Ziel-Schemaversion: ${LATEST_VERSION}`);
const t0 = Date.now();
await engine.initSchema();
console.log(`initSchema() fertig in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const version = await engine.getConfig("version").catch(() => null);
console.log(`Schemaversion in der DB: ${version ?? "unbekannt"}`);

await engine.close?.();
