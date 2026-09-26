import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Pick ONLY the corpus location from .env.local so corpus-path tests resolve
// the external corpus (see src/lib/corpus-paths.ts). Loading the whole file
// would leak real DB/Stripe/auth settings into unit tests and switch stores
// from the file backend to Postgres. Missing file → corpus tests skip.
const CORPUS_ENV_KEYS = ["SUBSUMIO_LAW_CORPUS_DIR", "LAW_CORPUS_ROOT"] as const;
if (existsSync(".env.local")) {
  const parsed = parseEnv(readFileSync(".env.local", "utf8"));
  for (const key of CORPUS_ENV_KEYS) {
    if (parsed[key] && !process.env[key]) process.env[key] = parsed[key];
  }
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

// DMS egress guard: unit tests never touch real DNS — every host resolves to
// a public documentation address unless a test sets its own resolver.
import { setDmsHostResolver } from "@/lib/dms/egress";
setDmsHostResolver(async () => ["93.184.216.34"]);
