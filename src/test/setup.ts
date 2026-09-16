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

// Unit tests must be deterministic and DB-free. When .env.local configures a
// real Postgres (local dev/prod-like runs), every store switches to the PG
// adapter and dozens of "in-memory fallback" tests break with real-DB errors
// (uuid casts, unique constraints, unmocked pool methods). Unset the DB keys
// so stores resolve their file/in-memory adapters — the suite documents this
// contract ("no DATABASE_URL in test env"). Integration tests that need a real
// DB live outside vitest (Playwright e2e, bun test under server/).
for (const key of [
  "SUBSUMIO_AUTH_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  // Dev-mode marker tests expect sbplain: — encryption-key tests set their own.
  "SUBSUMIO_ENCRYPTION_KEY",
]) {
  delete process.env[key];
}

afterEach(() => {
  cleanup();
});
