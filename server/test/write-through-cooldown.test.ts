/**
 * Write-through cooldown tests (v0.43.0 pbrain feature port).
 * Validates that writePageThrough skips files modified < 60s ago.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { writePageThrough } from "../src/core/write-through.ts";
import { writeFileSync, mkdirSync, rmSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let engine: PGLiteEngine;
let repoPath: string;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  repoPath = join(tmpdir(), `gbrain-test-wt-${Date.now()}`);
  mkdirSync(repoPath, { recursive: true });
  await engine.setConfig("sync.repo_path", repoPath);
});

afterAll(async () => {
  await engine.disconnect();
  rmSync(repoPath, { recursive: true, force: true });
});

describe("write-through cooldown", () => {
  test("writes when file is older than 60s", async () => {
    const slug = "test/old-file";
    await engine.putPage(slug, {
      type: "concept",
      title: "Old File",
      compiled_truth: "Content.",
      timeline: "",
    });

    // Create a file with an old mtime (2 minutes ago)
    const filePath = join(repoPath, `${slug}.md`);
    mkdirSync(join(repoPath, "test"), { recursive: true });
    writeFileSync(filePath, "# old", "utf8");
    const oldTime = new Date(Date.now() - 120_000);
    utimesSync(filePath, oldTime, oldTime);

    const result = await writePageThrough(engine, slug);
    expect(result.written).toBe(true);
  });

  test("skips write when file was modified < 60s ago", async () => {
    const slug = "test/recent-file";
    await engine.putPage(slug, {
      type: "concept",
      title: "Recent File",
      compiled_truth: "Content.",
      timeline: "",
    });

    // Create a file RIGHT NOW
    const filePath = join(repoPath, `${slug}.md`);
    mkdirSync(join(repoPath, "test"), { recursive: true });
    writeFileSync(filePath, "# recent", "utf8");

    // Write-through should skip because mtime is < 60s
    const result = await writePageThrough(engine, slug);
    expect(result.written).toBe(false);
    expect(result.skipped).toBe("file_recently_modified");
  });
});
