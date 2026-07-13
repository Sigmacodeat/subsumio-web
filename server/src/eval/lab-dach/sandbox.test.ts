import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSandbox,
  cleanupSandbox,
  writeInputDocument,
  readSandboxFile,
  writeDeliverable,
  listSandboxFiles,
  validateSandboxPath,
  isInDocumentsDir,
  isInOutputDir,
  isRuntimeExceeded,
  getRemainingRuntime,
  getSandboxEnv,
} from "./sandbox.ts";
import { existsSync } from "node:fs";

// ── Fixtures ──────────────────────────────────────────────────────────

const RUN_ID = "test-run-001";
const TASK_ID = "test-task-001";

// ── Tests ─────────────────────────────────────────────────────────────

describe("validateSandboxPath", () => {
  it("accepts paths within the sandbox", () => {
    const root = "/tmp/lab-dach-runs/test/test-task";
    const result = validateSandboxPath(root, "documents/file.txt");
    expect(result).not.toBeNull();
    expect(result!.startsWith(root)).toBe(true);
  });

  it("rejects path traversal with ../", () => {
    const root = "/tmp/lab-dach-runs/test/test-task";
    const result = validateSandboxPath(root, "../../../etc/passwd");
    expect(result).toBeNull();
  });

  it("contains absolute paths within sandbox", () => {
    const root = "/tmp/lab-dach-runs/test/test-task";
    const result = validateSandboxPath(root, "/etc/passwd");
    // path.join contains absolute paths under the root — safe behavior
    expect(result).not.toBeNull();
    expect(result!.startsWith(root)).toBe(true);
  });
});

describe("createSandbox", () => {
  let sandbox: ReturnType<typeof createSandbox>;

  beforeEach(() => {
    sandbox = createSandbox({ runId: RUN_ID, taskId: TASK_ID });
  });

  afterEach(() => {
    cleanupSandbox(sandbox);
  });

  it("creates directory structure", () => {
    expect(existsSync(sandbox.rootDir)).toBe(true);
    expect(existsSync(sandbox.documentsDir)).toBe(true);
    expect(existsSync(sandbox.outputDir)).toBe(true);
  });

  it("sets default runtime limit to 5 minutes", () => {
    expect(sandbox.runtimeLimitMs).toBe(5 * 60 * 1000);
  });

  it("sets custom runtime limit", () => {
    const custom = createSandbox({ runId: RUN_ID, taskId: "custom-rt", runtimeLimitMs: 60000 });
    expect(custom.runtimeLimitMs).toBe(60000);
    cleanupSandbox(custom);
  });
});

describe("writeInputDocument / readSandboxFile", () => {
  let sandbox: ReturnType<typeof createSandbox>;

  beforeEach(() => {
    sandbox = createSandbox({ runId: RUN_ID, taskId: "io-test" });
  });

  afterEach(() => {
    cleanupSandbox(sandbox);
  });

  it("writes and reads a document", () => {
    writeInputDocument(sandbox, "case.txt", "This is a test case file.");
    const content = readSandboxFile(sandbox, "documents/case.txt");
    expect(content).toBe("This is a test case file.");
  });

  it("rejects path traversal in write", () => {
    expect(() => writeInputDocument(sandbox, "../../etc/evil", "bad")).toThrow();
  });

  it("rejects path traversal in read", () => {
    expect(() => readSandboxFile(sandbox, "../../../etc/passwd")).toThrow();
  });

  it("rejects files over 1MB", () => {
    const large = "x".repeat(1024 * 1024 + 1);
    expect(() => writeInputDocument(sandbox, "large.txt", large)).toThrow();
  });
});

describe("writeDeliverable", () => {
  let sandbox: ReturnType<typeof createSandbox>;

  beforeEach(() => {
    sandbox = createSandbox({ runId: RUN_ID, taskId: "deliverable-test" });
  });

  afterEach(() => {
    cleanupSandbox(sandbox);
  });

  it("writes a deliverable to output/", () => {
    writeDeliverable(sandbox, "memo.md", "# Memo\nTest content");
    const content = readSandboxFile(sandbox, "output/memo.md");
    expect(content).toBe("# Memo\nTest content");
  });

  it("rejects path traversal", () => {
    expect(() => writeDeliverable(sandbox, "../../evil.txt", "bad")).toThrow();
  });

  it("rejects files over 1MB", () => {
    const large = "x".repeat(1024 * 1024 + 1);
    expect(() => writeDeliverable(sandbox, "large.txt", large)).toThrow();
  });
});

describe("isInDocumentsDir / isInOutputDir", () => {
  let sandbox: ReturnType<typeof createSandbox>;

  beforeEach(() => {
    sandbox = createSandbox({ runId: RUN_ID, taskId: "path-test" });
  });

  afterEach(() => {
    cleanupSandbox(sandbox);
  });

  it("correctly identifies documents path", () => {
    expect(isInDocumentsDir(sandbox, "documents/file.txt")).toBe(true);
    expect(isInDocumentsDir(sandbox, "output/file.txt")).toBe(false);
  });

  it("correctly identifies output path", () => {
    expect(isInOutputDir(sandbox, "output/memo.md")).toBe(true);
    expect(isInOutputDir(sandbox, "documents/memo.md")).toBe(false);
  });
});

describe("runtime checks", () => {
  it("isRuntimeExceeded returns false for new sandbox", () => {
    const sandbox = createSandbox({ runId: RUN_ID, taskId: "rt-test" });
    expect(isRuntimeExceeded(sandbox)).toBe(false);
    cleanupSandbox(sandbox);
  });

  it("isRuntimeExceeded returns true after limit", async () => {
    const sandbox = createSandbox({ runId: RUN_ID, taskId: "rt-test-2", runtimeLimitMs: 1 });
    // Wait 5ms to ensure we exceed the 1ms limit
    await new Promise((r) => setTimeout(r, 5));
    expect(isRuntimeExceeded(sandbox)).toBe(true);
    cleanupSandbox(sandbox);
  });

  it("getRemainingRuntime returns positive for new sandbox", () => {
    const sandbox = createSandbox({ runId: RUN_ID, taskId: "rt-test-3", runtimeLimitMs: 60000 });
    const remaining = getRemainingRuntime(sandbox);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60000);
    cleanupSandbox(sandbox);
  });
});

describe("getSandboxEnv", () => {
  it("returns safe env without API keys", () => {
    const sandbox = createSandbox({ runId: RUN_ID, taskId: "env-test" });
    const env = getSandboxEnv(sandbox);
    expect(env.SANDBOX_ROOT).toBe(sandbox.rootDir);
    expect(env.SANDBOX_DOCUMENTS).toBe(sandbox.documentsDir);
    expect(env.SANDBOX_OUTPUT).toBe(sandbox.outputDir);
    // No API keys
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    cleanupSandbox(sandbox);
  });
});

describe("cleanupSandbox", () => {
  it("removes the sandbox directory", () => {
    const sandbox = createSandbox({ runId: RUN_ID, taskId: "cleanup-test" });
    expect(existsSync(sandbox.rootDir)).toBe(true);
    cleanupSandbox(sandbox);
    expect(existsSync(sandbox.rootDir)).toBe(false);
    expect(sandbox.cleaned).toBe(true);
  });

  it("is idempotent", () => {
    const sandbox = createSandbox({ runId: RUN_ID, taskId: "cleanup-test-2" });
    cleanupSandbox(sandbox);
    cleanupSandbox(sandbox); // Should not throw
    expect(sandbox.cleaned).toBe(true);
  });
});
