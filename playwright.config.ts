import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-playwright",
  fullyParallel: process.env.CI ? true : false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The mock engine is intentionally in-memory and shared by the web server.
  // A single worker prevents cross-tenant fixture state from leaking between
  // suites and makes local and CI results deterministic.
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
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
  webServer: [
    {
      command: "bun run tests/e2e-mock-engine.ts",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Every run gets a fresh file-backed auth/org store. Explicitly blank the
      // supported database aliases so a developer's .env.local can never point
      // E2E at a real auth database. `$$` is the web-server shell PID.
      command:
        "SUBSUMIO_DATA_DIR=/tmp/subsumio-e2e-$$ SUBSUMIO_AUTH_DATABASE_URL= DATABASE_URL= POSTGRES_URL= POSTGRES_PRISMA_URL= SUBSUMIO_IP_ALLOWLIST= WHATSAPP_VERIFY_TOKEN=test_verify_token WHATSAPP_APP_SECRET=test_app_secret DOCUSIGN_CONNECT_SECRET=test_docusign_connect_secret bunx next dev --turbopack",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
