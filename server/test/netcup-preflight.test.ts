/**
 * server/deploy/netcup/preflight.sh — AI provider keys.
 *
 * Production runs the chat models directly at Anthropic (SUBSUMIO_AI_PROVIDER
 * unset); OpenRouter is an optional fallback, mandatory only when it is the
 * chosen provider or when the embedding model runs through it. Each case runs
 * the real script on a temporary .env with a sandboxed PATH (fixed `df`, no
 * `docker`), so only the configuration decides the outcome.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../deploy/netcup/preflight.sh");
let dir = "";
let bin = "";
let corpus = "";

const BASE: Record<string, string> = {
  APP_DOMAIN: "app.example.at",
  ENGINE_DOMAIN: "engine.example.at",
  POSTGRES_PASSWORD: "x",
  SUBSUMIO_WEB_API_KEY: "x",
  AUTH_SECRET: "x",
  SUBSUMIO_INTERNAL_SECRET: "x",
  SUBSUMIO_ENCRYPTION_KEY: "x",
  CRON_SECRET: "x",
  ENGINE_WEBHOOK_API_KEY: "x",
  BACKUP_RESTIC_REPOSITORY: "/backup/repo",
  BACKUP_RESTIC_PASSWORD: "x",
  SUBSUMIO_STORAGE_ENCRYPTION_KEY: "x",
  RESEND_API_KEY: "x",
  MAIL_FROM: "kanzlei@example.at",
  RESEND_WEBHOOK_SECRET: "x",
  PORTAL_TOKEN_SECRET: "x",
  SUBSUMIO_REQUIRE_TENANT: "true",
  SUBSUMIO_WEB_URL: "http://web:3000",
  PLATFORM_OPERATOR_EMAILS: "ops@example.at",
  SUBSUMIO_EMBEDDING_MODEL: "openrouter:openai/text-embedding-3-small",
  SUBSUMIO_EMBEDDING_DIMENSIONS: "1536",
};

function run(env: Record<string, string | undefined>): { code: number; out: string } {
  const merged = { ...BASE, LAW_CORPUS_HOST_DIR: corpus, ...env };
  const lines = Object.entries(merged)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  const file = join(dir, `env-${Math.random().toString(36).slice(2)}`);
  writeFileSync(file, `${lines.join("\n")}\n`);
  const res = spawnSync("/bin/sh", [SCRIPT, file], {
    cwd: dir,
    env: { PATH: bin },
    encoding: "utf8",
  });
  if (res.error) throw res.error;
  return { code: res.status ?? -1, out: `${res.stdout}${res.stderr}` };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "preflight-"));
  bin = join(dir, "bin");
  corpus = join(dir, "corpus");
  mkdirSync(bin);
  mkdirSync(corpus);
  writeFileSync(join(corpus, "at.jsonl"), "{}\n");
  for (const tool of ["sed", "tail", "tr", "awk", "ls", "cat"]) {
    const found = ["/bin", "/usr/bin"].map((p) => join(p, tool)).find((p) => existsSync(p));
    if (!found) throw new Error(`${tool} not found`);
    symlinkSync(found, join(bin, tool));
  }
  // Deterministic free space: 50 %.
  writeFileSync(
    join(bin, "df"),
    "#!/bin/sh\necho 'Filesystem 1024-blocks Used Available Capacity Mounted'\necho '/dev/disk 100 50 50 50% /'\n"
  );
  chmodSync(join(bin, "df"), 0o755);
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("preflight: AI provider keys", () => {
  test("direct Anthropic (provider unset) with OpenRouter embeddings passes", () => {
    const r = run({ ANTHROPIC_API_KEY: "sk-ant", OPENROUTER_API_KEY: "sk-or" });
    expect(r.out).toContain("OK       ANTHROPIC_API_KEY");
    expect(r.out).toContain("PASSED");
    expect(r.code).toBe(0);
  });

  test("provider unset requires ANTHROPIC_API_KEY", () => {
    const r = run({ OPENROUTER_API_KEY: "sk-or" });
    expect(r.out).toContain("MISSING  ANTHROPIC_API_KEY");
    expect(r.code).toBe(1);
  });

  test("provider openrouter requires OPENROUTER_API_KEY, not Anthropic", () => {
    const missing = run({ SUBSUMIO_AI_PROVIDER: "openrouter" });
    expect(missing.out).toContain("MISSING  OPENROUTER_API_KEY");
    expect(missing.code).toBe(1);
    const ok = run({ SUBSUMIO_AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "sk-or" });
    expect(ok.out).not.toContain("ANTHROPIC_API_KEY");
    expect(ok.code).toBe(0);
  });

  test("OpenRouter embeddings need the OpenRouter key even with direct Anthropic chat", () => {
    const r = run({ ANTHROPIC_API_KEY: "sk-ant" });
    expect(r.out).toContain("MISSING  OPENROUTER_API_KEY (für SUBSUMIO_EMBEDDING_MODEL=");
    expect(r.code).toBe(1);
  });

  test("other embedding providers need their own key; OpenRouter then only warns", () => {
    const voyage = run({
      ANTHROPIC_API_KEY: "sk-ant",
      SUBSUMIO_EMBEDDING_MODEL: "voyage:voyage-3",
    });
    expect(voyage.out).toContain("MISSING  VOYAGE_API_KEY");
    expect(voyage.code).toBe(1);
    const openai = run({
      ANTHROPIC_API_KEY: "sk-ant",
      SUBSUMIO_EMBEDDING_MODEL: "openai:text-embedding-3-large",
      OPENAI_API_KEY: "sk-oa",
    });
    expect(openai.out).toContain("WARN     OPENROUTER_API_KEY leer");
    expect(openai.code).toBe(0);
  });

  test("unknown provider values and embedding models are rejected", () => {
    expect(
      run({ ANTHROPIC_API_KEY: "k", OPENROUTER_API_KEY: "k", SUBSUMIO_AI_PROVIDER: "gpt" }).out
    ).toContain("INVALID  SUBSUMIO_AI_PROVIDER");
    const bad = run({
      ANTHROPIC_API_KEY: "k",
      OPENROUTER_API_KEY: "k",
      SUBSUMIO_EMBEDDING_MODEL: "text-embedding-3-small",
    });
    expect(bad.out).toContain("INVALID  SUBSUMIO_EMBEDDING_MODEL");
    expect(bad.code).toBe(1);
    const noModel = run({ ANTHROPIC_API_KEY: "k", SUBSUMIO_EMBEDDING_MODEL: "" });
    expect(noModel.out).toContain("MISSING  SUBSUMIO_EMBEDDING_MODEL");
    expect(noModel.code).toBe(1);
  });
});
