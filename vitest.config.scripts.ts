/**
 * Vitest config for server/scripts/ unit tests (ris-delta, backfill-utils, etc.).
 * These are pure-logic tests without DB or React — node environment suffices.
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["server/scripts/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
