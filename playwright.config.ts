import { defineConfig, devices } from "@playwright/test";

// Real engine mode: SUBSUMIO_E2E_REAL_ENGINE=1 uses the local gbrain engine
// on :31429 (with Ollama embeddings) instead of the mock engine on :3001.
// This enables real PDF extraction, real search, and real AI analysis.
const USE_REAL_ENGINE = process.env.SUBSUMIO_E2E_REAL_ENGINE === "1";
// 127.0.0.1, not localhost: the engine listens on IPv4 only and Node may try ::1 first.
const REAL_ENGINE_URL = process.env.SUBSUMIO_E2E_ENGINE_URL ?? "http://127.0.0.1:31429";
// The web server under test. Override when :3000 is taken (a running dev
// server, another project) — e.g. SUBSUMIO_E2E_PORT=3100. 127.0.0.1 on purpose:
// "localhost" may resolve to ::1 where an unrelated server can be listening.
const E2E_PORT = process.env.SUBSUMIO_E2E_PORT ?? "3000";
const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
// Separate build output so an e2e build never clobbers a running dev server's .next.
const E2E_DIST_DIR = process.env.SUBSUMIO_E2E_DIST_DIR ?? ".next";
// Real-engine credentials come from the environment (never hard-code them here):
//   SUBSUMIO_E2E_ENGINE_KEY        — falls back to SUBSUMIO_WEB_API_KEY (the engine's key)
//   SUBSUMIO_E2E_AUTH_DATABASE_URL — throwaway auth DB for the real-engine run
const REAL_ENGINE_KEY =
  process.env.SUBSUMIO_E2E_ENGINE_KEY ?? process.env.SUBSUMIO_WEB_API_KEY ?? "";
const REAL_ENGINE_AUTH_DB_URL =
  process.env.SUBSUMIO_E2E_AUTH_DATABASE_URL ??
  "postgres://localhost:5432/subsumio_e2e?sslmode=disable";
if (USE_REAL_ENGINE && !REAL_ENGINE_KEY) {
  throw new Error(
    "SUBSUMIO_E2E_REAL_ENGINE=1 needs SUBSUMIO_E2E_ENGINE_KEY (or SUBSUMIO_WEB_API_KEY) in the environment."
  );
}

// Every run gets a fresh file-backed auth/org store PLUS a throwaway Postgres
// database (`subsumio_e2e`, dropped+recreated before the server starts).
// Postgres-backed features — portal-token revocations, verification receipts,
// experience profiles, comments, audit — have no file fallback; without a DB
// they 500/403 under test. The dedicated e2e DB keeps isolation: a developer's
// .env.local can never point E2E at a real auth database (blanked aliases +
// fixed e2e URL), and SUBSUMIO_API_URL + provider keys stay blank so the app
// can never reach a real engine or paid AI provider (mock engine on :3001).
// SUBSUMIO_E2E=1 lifts the auth rate limits that otherwise 429 the per-test
// signups — the flag is inert under NODE_ENV=production.
//
// PRODUCTION SERVER (not `next dev`): the dev compiler's on-demand route
// compilation pushes the process past the default ~4GB V8 heap under suite
// load → SIGABRT OOM crash → ECONNREFUSED cascades. A production build
// (`next build` → `.next/BUILD_ID`) is pre-compiled; `next start` serves it
// with ~400MB RSS and zero cold-compile stalls.
//
// `next start` hardcodes NODE_ENV=production (overriding any explicit
// setting). Production guards that would block e2e are bypassed by
// SUBSUMIO_E2E=1 (never set in real production):
//   - instrumentation.ts: env-validation abort
//   - engine.ts: engineConfigurationResponse 503
//   - rate-limit.ts: signup/login bypass
//   - engine.ts: credit bypass
//   - session.ts: secure-cookie flag (HTTP e2e can't use secure cookies)
//
// Test secrets (AUTH_SECRET, SUBSUMIO_ENCRYPTION_KEY) are explicit so the
// production guards in getAuthSecret() / isEncryptionEnabled() pass naturally.
// The Postgres URL uses sslmode=disable because local Postgres has no TLS
// (production guard forces SSL otherwise).
const WEB_SERVER_ENV_BASE: Record<string, string> = {
  NEXT_DIST_DIR: E2E_DIST_DIR,
  NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
  NEXT_PUBLIC_SITE_URL: E2E_BASE_URL,
  AUTH_SECRET: "subsumio-e2e-test-secret-32-chars-min!!",
  SUBSUMIO_ENCRYPTION_KEY: "subsumio-e2e-encryption-key-32chars!",
  SUBSUMIO_DATA_DIR: `/tmp/subsumio-e2e-${process.pid}`,
  SUBSUMIO_E2E: "1",
  DATABASE_URL: "",
  POSTGRES_URL: "",
  POSTGRES_PRISMA_URL: "",
  SUBSUMIO_IP_ALLOWLIST: "",
  OPENROUTER_API_KEY: "",
  OPENROUTER_API_KEY_FALLBACK: "",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  WHATSAPP_VERIFY_TOKEN: "test_verify_token",
  WHATSAPP_APP_SECRET: "test_app_secret",
  DOCUSIGN_CONNECT_SECRET: "test_docusign_connect_secret",
};

const MOCK_ENGINE_WEB_ENV: Record<string, string> = {
  ...WEB_SERVER_ENV_BASE,
  // CI overrides this via SUBSUMIO_E2E_DB_URL (service container needs
  // postgres:postgres credentials + sslmode=disable); local dev keeps the
  // passwordless localhost socket-adjacent default.
  SUBSUMIO_AUTH_DATABASE_URL:
    process.env.SUBSUMIO_E2E_DB_URL ?? "postgres://localhost:5432/subsumio_e2e?sslmode=disable",
  // Points at the mock engine on :3001 — this IS the engine under test, not a
  // real one. Blank would fall back to the same default in engine.ts but makes
  // isEngineLLMAvailable() false, disabling engine-backed surfaces (concierge).
  SUBSUMIO_API_URL: "http://localhost:3001",
};

const REAL_ENGINE_WEB_ENV: Record<string, string> = {
  ...WEB_SERVER_ENV_BASE,
  SUBSUMIO_AUTH_DATABASE_URL: REAL_ENGINE_AUTH_DB_URL,
  SUBSUMIO_API_URL: REAL_ENGINE_URL,
  SUBSUMIO_WEB_API_KEY: REAL_ENGINE_KEY,
};

const BUILD_IF_NEEDED = `test -f ${E2E_DIST_DIR}/BUILD_ID || npm run build`;
const START_WEB = `bunx next start -p ${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e-playwright",
  fullyParallel: process.env.CI ? true : false,
  forbidOnly: !!process.env.CI,
  // The mock engine is intentionally in-memory and shared by the web server.
  // A single worker prevents cross-tenant fixture state from leaking between
  // suites and makes local and CI results deterministic.
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: E2E_BASE_URL,
    reducedMotion: "reduce",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: process.env.CI
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
        { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
        { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
      ],
  webServer: USE_REAL_ENGINE
    ? [
        {
          // Real engine mode: use the local gbrain engine on :31429
          // (must be started separately: see docs/ANWALTSTAG-TESTSCRIPT.md)
          command: `${BUILD_IF_NEEDED}; ${START_WEB}`,
          env: REAL_ENGINE_WEB_ENV,
          url: E2E_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      ]
    : [
        {
          command: "bun run tests/e2e-mock-engine.ts",
          url: "http://localhost:3001/health",
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          command: `${BUILD_IF_NEEDED}; bash scripts/e2e-pg-setup.sh || echo '[e2e-pg] setup failed — Postgres-backed specs may fail'; ${START_WEB}`,
          env: MOCK_ENGINE_WEB_ENV,
          url: E2E_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      ],
});
