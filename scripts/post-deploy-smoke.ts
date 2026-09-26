/**
 * Post-deploy smoke test of the integrations (Resend, engine, storage
 * encryption, cron/portal secrets; optionally Mistral, OpenRouter, Anthropic,
 * Microsoft Graph, DocuSign, FCM, Stripe, DMS allow list).
 *
 * Runs inside the web container and reads its env. Every probe is read-only
 * (listing, key info, token exchange) — no mail, completion, transcription or
 * push is sent. Secrets are never printed. Logic: src/lib/post-deploy-smoke.ts.
 *
 * The web image does not contain scripts/ or src/; Dockerfile.web bundles
 * this file (with the libraries it uses) to /app/scripts/post-deploy-smoke.js.
 *
 * Usage (server, see server/deploy/netcup/RUNBOOK.md):
 *   docker exec subsumio-engine-web-1 bun scripts/post-deploy-smoke.js
 *   docker exec subsumio-engine-web-1 bun scripts/post-deploy-smoke.js --strict
 *
 * Exit code: 1 when a required service is missing or fails (with --strict
 * also when a configured optional one fails), else 0.
 */
import { exitCode, renderTable, runSmoke } from "../src/lib/post-deploy-smoke";

async function main(): Promise<void> {
  const strict = process.argv.includes("--strict");
  const results = await runSmoke(process.env);
  console.log(renderTable(results, process.env));
  const code = exitCode(results, strict);
  console.log(code === 0 ? "\nErgebnis: bestanden" : "\nErgebnis: NICHT bestanden");
  process.exit(code);
}

main().catch(() => {
  // No message: an unexpected error text could carry configuration values.
  console.error("Smoke-Test abgebrochen (unerwarteter Fehler)");
  process.exit(2);
});
