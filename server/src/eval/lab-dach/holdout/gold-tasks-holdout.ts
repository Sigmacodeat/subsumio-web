/**
 * LAB-DACH v3 — Holdout Gold Tasks (STUB)
 *
 * The actual holdout tasks have been removed from the repository to prevent
 * benchmark leakage. Only a SHA-256 manifest remains for integrity verification.
 *
 * To run holdout tasks, provide the external path via --holdout-path:
 *   bun run server/src/eval/lab-dach/cli.ts --holdout-path /path/to/holdout.ts
 *
 * The external file must export `GOLD_HOLDOUT: Task[]`.
 * Task hashes are verified against holdout-manifest.json at load time.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { Task } from "../types.ts";

export const GOLD_HOLDOUT: Task[] = [];

export interface HoldoutManifestEntry {
  id: string;
  title: string;
  jurisdiction: string;
  legal_area: string;
  hash: string;
}

export interface HoldoutManifest {
  generated_at: string;
  task_count: number;
  seal_hash: string;
  tasks: HoldoutManifestEntry[];
}

export const HOLDOUT_MANIFEST_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "holdout-manifest.json"
);

export function loadHoldoutManifest(): HoldoutManifest {
  return JSON.parse(readFileSync(HOLDOUT_MANIFEST_PATH, "utf-8"));
}

export function loadHoldoutTasksFromPath(path: string): Task[] {
  const mod = require(path);
  const tasks: Task[] = mod.GOLD_HOLDOUT ?? [];

  if (tasks.length === 0) {
    throw new Error(`No GOLD_HOLDOUT exported from ${path}`);
  }

  const manifest = loadHoldoutManifest();
  if (tasks.length !== manifest.task_count) {
    throw new Error(
      `Holdout task count mismatch: expected ${manifest.task_count}, got ${tasks.length}`
    );
  }

  for (const task of tasks) {
    const hash = createHash("sha256")
      .update(task.id + "|" + task.prompt + "|" + (task.reference_output ?? ""), "utf8")
      .digest("hex");
    const entry = manifest.tasks.find((t) => t.id === task.id);
    if (!entry) {
      throw new Error(`Holdout task ${task.id} not found in manifest`);
    }
    if (entry.hash !== hash) {
      throw new Error(
        `Holdout task ${task.id} hash mismatch: expected ${entry.hash}, got ${hash}`
      );
    }
  }

  return tasks;
}


