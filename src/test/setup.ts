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

afterEach(() => {
  cleanup();
});
