/**
 * T7.2 / WP7.2.1 — Vitest configuration for Identity Lifecycle tests.
 *
 * vi.mock-based suites are unstable under Bun's test runner.
 * This config ensures Vitest runs with node environment and proper alias.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/lib/auth/identity-lifecycle.test.ts",
      "src/lib/auth/revocation-e2e.test.ts",
      "src/lib/scim.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
