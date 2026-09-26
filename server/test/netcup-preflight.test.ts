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

describe("preflight: EU processing (bedrock-eu, SUBSUMIO_EU_ONLY)", () => {
  const bedrock = {
    SUBSUMIO_AI_PROVIDER: "bedrock-eu",
    AWS_ACCESS_KEY_ID: "AKIA",
    AWS_SECRET_ACCESS_KEY: "secret",
    AWS_REGION: "eu-central-1",
    OPENROUTER_API_KEY: "sk-or",
  };

  test("direct Anthropic passes but warns that it is not EU processing", () => {
    const r = run({ ANTHROPIC_API_KEY: "sk-ant", OPENROUTER_API_KEY: "sk-or" });
    expect(r.out).toContain("nicht in der EU");
    expect(r.code).toBe(0);
  });

  test("bedrock-eu needs AWS credentials (or a Bedrock API key) and an EU member-state region", () => {
    expect(run(bedrock).code).toBe(0);
    const noKeys = run({ ...bedrock, AWS_ACCESS_KEY_ID: undefined });
    expect(noKeys.out).toContain("MISSING  AWS_ACCESS_KEY_ID");
    expect(noKeys.code).toBe(1);
    const bearer = run({
      ...bedrock,
      AWS_ACCESS_KEY_ID: undefined,
      AWS_SECRET_ACCESS_KEY: undefined,
      AWS_BEARER_TOKEN_BEDROCK: "tok",
    });
    expect(bearer.code).toBe(0);
    // London/Zürich profiles route outside the EU member states.
    const london = run({ ...bedrock, AWS_REGION: "eu-west-2" });
    expect(london.out).toContain("INVALID  AWS_REGION");
    expect(london.code).toBe(1);
  });

  test("EU_ONLY demands bedrock-eu, no Anthropic direct key and EU critic models", () => {
    const direct = run({
      ANTHROPIC_API_KEY: "sk-ant",
      OPENROUTER_API_KEY: "sk-or",
      SUBSUMIO_EU_ONLY: "1",
    });
    expect(direct.out).toContain("verlangt SUBSUMIO_AI_PROVIDER=bedrock-eu");
    expect(direct.code).toBe(1);
    const leftoverKey = run({
      ...bedrock,
      SUBSUMIO_EU_ONLY: "1",
      ANTHROPIC_API_KEY: "sk-ant",
      SUBSUMIO_ENSEMBLE_CRITIC_MODELS: "bedrock:eu.anthropic.claude-sonnet-5",
    });
    expect(leftoverKey.out).toContain("ANTHROPIC_API_KEY unter SUBSUMIO_EU_ONLY=1 entfernen");
    expect(leftoverKey.code).toBe(1);
    // Embeddings are part of EU_ONLY: a non-EU embedding model without the
    // explicit opt-out would make the engine refuse every embedding call.
    const nonEuEmbedding = run({
      ...bedrock,
      SUBSUMIO_EU_ONLY: "1",
      SUBSUMIO_ENSEMBLE_CRITIC_MODELS: "bedrock:eu.anthropic.claude-sonnet-5",
    });
    expect(nonEuEmbedding.out).toContain("schließt Embeddings ein");
    expect(nonEuEmbedding.code).toBe(1);
    const optOut = run({
      ...bedrock,
      SUBSUMIO_EU_ONLY: "1",
      SUBSUMIO_EU_ONLY_EMBEDDINGS: "0",
      SUBSUMIO_ENSEMBLE_CRITIC_MODELS: "bedrock:eu.anthropic.claude-sonnet-5",
    });
    expect(optOut.out).toContain("per Opt-out");
    expect(optOut.code).toBe(0);
    const euEmbedding = run({
      ...bedrock,
      SUBSUMIO_EU_ONLY: "1",
      SUBSUMIO_EMBEDDING_MODEL: "mistral:mistral-embed",
      SUBSUMIO_EMBEDDING_DIMENSIONS: "1024",
      MISTRAL_API_KEY: "m",
      SUBSUMIO_ENSEMBLE_CRITIC_MODELS: "bedrock:eu.anthropic.claude-sonnet-5",
    });
    expect(euEmbedding.out).not.toContain("schließt Embeddings ein");
    expect(euEmbedding.out).not.toContain("per Opt-out");
    expect(euEmbedding.code).toBe(0);
    const selfHostedEnv = {
      ...bedrock,
      SUBSUMIO_EU_ONLY: "1",
      SUBSUMIO_EMBEDDING_MODEL: "llama-server:qwen3-embedding-8b",
      SUBSUMIO_EMBEDDING_DIMENSIONS: "4096",
      SUBSUMIO_ENSEMBLE_CRITIC_MODELS: "bedrock:eu.anthropic.claude-sonnet-5",
    };
    const selfHosted = run(selfHostedEnv);
    expect(selfHosted.out).toContain("SUBSUMIO_SELF_HOSTED_RESIDENCY=eu");
    expect(selfHosted.code).toBe(1);
    expect(run({ ...selfHostedEnv, SUBSUMIO_SELF_HOSTED_RESIDENCY: "eu" }).code).toBe(0);
  });
});
