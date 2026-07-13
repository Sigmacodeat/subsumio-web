/**
 * LAB-DACH v3 — Secure Task Isolation
 *
 * Pro-Task temporary directory with:
 *   - documents/ (read-only)
 *   - output/ (writable, 10MB limit)
 *   - No env vars or API keys in tool context
 *   - Path validation against ../
 *   - Runtime limit 5 min
 *   - File size limit 1MB
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join, resolve, normalize, sep } from "node:path";

// ── Constants ─────────────────────────────────────────────────────────

const BASE_DIR = "/tmp/lab-dach-runs";
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const DEFAULT_RUNTIME_LIMIT_MS = 5 * 60 * 1000; // 5 min

// ── Types ─────────────────────────────────────────────────────────────

export interface TaskSandbox {
  /** Root directory for this task run */
  rootDir: string;
  /** Read-only documents directory */
  documentsDir: string;
  /** Writable output directory */
  outputDir: string;
  /** Runtime limit in milliseconds */
  runtimeLimitMs: number;
  /** Start time (epoch ms) */
  startedAt: number;
  /** Whether the sandbox has been cleaned up */
  cleaned: boolean;
}

export interface SandboxViolation {
  type:
    | "path_traversal"
    | "file_too_large"
    | "output_too_large"
    | "runtime_exceeded"
    | "write_to_documents";
  message: string;
  path?: string;
}

// ── Path Validation ───────────────────────────────────────────────────

/**
 * Validate that a path is within the sandbox root.
 * Prevents path traversal via ../ or absolute paths.
 */
export function validateSandboxPath(sandboxRoot: string, targetPath: string): string | null {
  const normalizedRoot = normalize(resolve(sandboxRoot));
  const normalizedTarget = normalize(resolve(join(sandboxRoot, targetPath)));

  // Check for path traversal
  if (!normalizedTarget.startsWith(normalizedRoot + sep) && normalizedTarget !== normalizedRoot) {
    return null;
  }

  return normalizedTarget;
}

/**
 * Check if a path is within the documents (read-only) directory.
 */
export function isInDocumentsDir(sandbox: TaskSandbox, targetPath: string): boolean {
  const resolved = validateSandboxPath(sandbox.rootDir, targetPath);
  if (!resolved) return false;
  return resolved.startsWith(sandbox.documentsDir + sep) || resolved === sandbox.documentsDir;
}

/**
 * Check if a path is within the output (writable) directory.
 */
export function isInOutputDir(sandbox: TaskSandbox, targetPath: string): boolean {
  const resolved = validateSandboxPath(sandbox.rootDir, targetPath);
  if (!resolved) return false;
  return resolved.startsWith(sandbox.outputDir + sep) || resolved === sandbox.outputDir;
}

// ── Sandbox Creation ──────────────────────────────────────────────────

/**
 * Create a secure task sandbox.
 *
 * Directory structure:
 *   /tmp/lab-dach-runs/<run-id>/<task-id>/
 *     documents/   (read-only — input case files)
 *     output/      (writable — agent deliverables)
 */
export function createSandbox(opts: {
  runId: string;
  taskId: string;
  runtimeLimitMs?: number;
}): TaskSandbox {
  const rootDir = join(BASE_DIR, opts.runId, opts.taskId);
  const documentsDir = join(rootDir, "documents");
  const outputDir = join(rootDir, "output");

  // Create directories
  mkdirSync(documentsDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  return {
    rootDir,
    documentsDir,
    outputDir,
    runtimeLimitMs: opts.runtimeLimitMs ?? DEFAULT_RUNTIME_LIMIT_MS,
    startedAt: Date.now(),
    cleaned: false,
  };
}

/**
 * Write an input document into the sandbox's documents/ directory.
 */
export function writeInputDocument(sandbox: TaskSandbox, filename: string, content: string): void {
  const path = validateSandboxPath(sandbox.documentsDir, filename);
  if (!path) {
    throw new Error(`Path traversal detected: ${filename}`);
  }
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${filename} (${content.length} bytes, max ${MAX_FILE_SIZE})`);
  }
  writeFileSync(path, content, "utf-8");
}

/**
 * Read a file from the sandbox (documents or output).
 */
export function readSandboxFile(sandbox: TaskSandbox, relativePath: string): string {
  const path = validateSandboxPath(sandbox.rootDir, relativePath);
  if (!path) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  if (!existsSync(path)) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const stat = statSync(path);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${relativePath} (${stat.size} bytes, max ${MAX_FILE_SIZE})`);
  }
  return readFileSync(path, "utf-8");
}

/**
 * Write a deliverable to the output/ directory.
 * Enforces 10MB total output limit and 1MB per-file limit.
 */
export function writeDeliverable(sandbox: TaskSandbox, filename: string, content: string): void {
  // Check runtime
  if (Date.now() - sandbox.startedAt > sandbox.runtimeLimitMs) {
    throw new Error("Runtime limit exceeded");
  }

  // Validate path
  const path = validateSandboxPath(sandbox.outputDir, filename);
  if (!path) {
    throw new Error(`Path traversal detected: ${filename}`);
  }

  // Check per-file size
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${filename} (${content.length} bytes, max ${MAX_FILE_SIZE})`);
  }

  // Check total output size
  const currentSize = getDirSize(sandbox.outputDir);
  if (currentSize + content.length > MAX_OUTPUT_SIZE) {
    throw new Error(
      `Output directory size limit exceeded (${currentSize + content.length} bytes, max ${MAX_OUTPUT_SIZE})`
    );
  }

  writeFileSync(path, content, "utf-8");
}

/**
 * List files in a directory within the sandbox.
 */
export function listSandboxFiles(sandbox: TaskSandbox, dirPath: string): string[] {
  const path = validateSandboxPath(sandbox.rootDir, dirPath);
  if (!path) {
    throw new Error(`Path traversal detected: ${dirPath}`);
  }
  if (!existsSync(path)) return [];

  const { readdirSync, statSync: stat } = require("node:fs");
  const entries = readdirSync(path);
  return entries.filter((entry: string) => {
    const fullPath = join(path, entry);
    return stat(fullPath).isFile();
  });
}

/**
 * Check if the sandbox runtime has expired.
 */
export function isRuntimeExceeded(sandbox: TaskSandbox): boolean {
  return Date.now() - sandbox.startedAt > sandbox.runtimeLimitMs;
}

/**
 * Get remaining runtime in milliseconds.
 */
export function getRemainingRuntime(sandbox: TaskSandbox): number {
  return Math.max(0, sandbox.runtimeLimitMs - (Date.now() - sandbox.startedAt));
}

/**
 * Clean up the sandbox (remove all files).
 */
export function cleanupSandbox(sandbox: TaskSandbox): void {
  if (sandbox.cleaned) return;
  if (existsSync(sandbox.rootDir)) {
    rmSync(sandbox.rootDir, { recursive: true, force: true });
  }
  sandbox.cleaned = true;
}

// ── Helpers ───────────────────────────────────────────────────────────

function getDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  const { readdirSync } = require("node:fs");
  let totalSize = 0;
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isFile()) {
      totalSize += stat.size;
    }
  }
  return totalSize;
}

/**
 * Get sandbox environment (safe to pass to tools — no API keys).
 */
export function getSandboxEnv(sandbox: TaskSandbox): Record<string, string> {
  return {
    SANDBOX_ROOT: sandbox.rootDir,
    SANDBOX_DOCUMENTS: sandbox.documentsDir,
    SANDBOX_OUTPUT: sandbox.outputDir,
    SANDBOX_RUNTIME_LIMIT_MS: String(sandbox.runtimeLimitMs),
  };
}
