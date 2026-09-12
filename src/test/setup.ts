import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Load .env.local so corpus-path tests resolve SUBSUMIO_LAW_CORPUS_DIR —
// the corpus lives outside the repo (see src/lib/corpus-paths.ts).
// Node 20.12+ has loadEnvFile; guard for absence so CI without the file
// still works (corpus-dependent tests skip on missing dir).
try {
  process.loadEnvFile?.(".env.local");
} catch {
  // no .env.local on this machine
}

afterEach(() => {
  cleanup();
});
