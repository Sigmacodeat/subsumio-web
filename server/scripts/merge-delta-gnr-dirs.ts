#!/usr/bin/env bun
/**
 * Merge norm files the daily RIS delta wrote under at-normen/gnr-<nr>/ back
 * into the folder the full fetch uses (at-normen/<abk>/…, see ris-norm-paths.ts).
 *
 * Before the delta shared the full fetch's path convention, an amendment of a
 * law with an abbreviation (ABGB, ZPO, MRG …) landed in gnr-<nr>/ next to the
 * unchanged file under <abk>/. The citation check and the norm reader kept
 * reading the old wording; the import created a second page for the same norm.
 *
 * Per file in such a gnr-<nr>/ folder (only when the file names an
 * abbreviation — gnr-<nr>/ is the right place for laws without one):
 *   - no counterpart in the target folder     → move it there
 *   - counterpart is older (zuletzt_geaendert / retrieved_at) → replace it
 *   - counterpart is newer or equal           → drop the gnr file
 * Every moved/replaced target is queued for import, every removed gnr file for
 * deletion (the corpus pipeline soft-deletes its page) — through the same
 * queue file the delta uses. No network, no database.
 *
 *   bun run server/scripts/merge-delta-gnr-dirs.ts                 # dry run (default)
 *   bun run server/scripts/merge-delta-gnr-dirs.ts --apply         # move files + queue
 *   bun run server/scripts/merge-delta-gnr-dirs.ts --corpus <dir>  # law-corpus root
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { resolveBundesnormDir, resolveNormFileName } from "./ris-norm-paths";

export interface MergeAction {
  kind: "move" | "replace" | "drop";
  from: string; // relative to the corpus root
  to: string; // relative to the corpus root
  reason: string;
}

function frontmatterField(content: string, field: string): string | null {
  const end = content.startsWith("---") ? content.indexOf("\n---", 3) : -1;
  if (end === -1) return null;
  const m = content.slice(0, end).match(new RegExp(`^${field}:\\s*"?([^"\\n]*)"?\\s*$`, "m"));
  return m ? m[1].trim() : null;
}

/** Date that says how fresh a norm file is: RIS change date, else retrieval date. */
function freshness(content: string): string {
  return (
    frontmatterField(content, "zuletzt_geaendert") ??
    frontmatterField(content, "retrieved_at") ??
    ""
  );
}

/** Plan the merge of every gnr-<nr>/ folder under <corpusRoot>/at-normen. Reads only. */
export function planMerge(corpusRoot: string): MergeAction[] {
  const normenDir = join(corpusRoot, "at-normen");
  const actions: MergeAction[] = [];
  if (!existsSync(normenDir)) return actions;

  for (const dirName of readdirSync(normenDir).sort()) {
    const gnr = dirName.match(/^gnr-(\d+)$/)?.[1];
    if (!gnr) continue;
    const gnrDir = join(normenDir, dirName);
    for (const file of readdirSync(gnrDir)
      .filter((f) => f.endsWith(".md"))
      .sort()) {
      const content = readFileSync(join(gnrDir, file), "utf8");
      const abk = frontmatterField(content, "abbreviation");
      if (!abk) continue; // law without abbreviation: gnr-<nr>/ is correct
      const targetDirName = resolveBundesnormDir(normenDir, abk, gnr);
      if (targetDirName === dirName) continue;
      const norId = frontmatterField(content, "nor_id") ?? "";
      const basisKey = file.replace(/\.md$/, "").replace(/-nor\d+$/i, "");
      const targetDir = join(normenDir, targetDirName);
      const targetFile = norId ? resolveNormFileName(targetDir, basisKey, norId) : `${basisKey}.md`;
      const from = `at-normen/${dirName}/${file}`;
      const to = `at-normen/${targetDirName}/${targetFile}`;
      const targetPath = join(targetDir, targetFile);
      if (!existsSync(targetPath)) {
        actions.push({ kind: "move", from, to, reason: "kein Gegenstück im Zielordner" });
        continue;
      }
      const mine = freshness(content);
      const theirs = freshness(readFileSync(targetPath, "utf8"));
      actions.push(
        mine > theirs
          ? { kind: "replace", from, to, reason: `neuer (${mine} > ${theirs || "—"})` }
          : { kind: "drop", from, to, reason: `nicht neuer (${mine || "—"} ≤ ${theirs})` }
      );
    }
  }
  return actions;
}

type QueueEntry = { pfad: string; benutzer: string; seit: string; art: string };

/** Carry out a plan: move/replace/drop files and queue imports + deletions. */
export function applyMerge(corpusRoot: string, actions: MergeAction[]): void {
  const queueFile = join(corpusRoot, "_normalized", "_import-warteschlange.json");
  let queue: QueueEntry[] = [];
  if (existsSync(queueFile)) {
    try {
      queue = JSON.parse(readFileSync(queueFile, "utf8"));
    } catch {
      queue = [];
    }
  }
  const enqueue = (pfad: string, art: string) => {
    const entry = { pfad, benutzer: "merge-delta-gnr-dirs", seit: new Date().toISOString(), art };
    const i = queue.findIndex((e) => e.pfad === pfad);
    if (i >= 0) queue[i] = entry;
    else queue.push(entry);
  };

  const touchedDirs = new Set<string>();
  for (const a of actions) {
    const from = join(corpusRoot, a.from);
    const to = join(corpusRoot, a.to);
    touchedDirs.add(join(from, ".."));
    if (a.kind === "drop") {
      unlinkSync(from);
    } else {
      mkdirSync(join(to, ".."), { recursive: true });
      renameSync(from, to);
      enqueue(a.to, "edit");
    }
    enqueue(a.from, "delete");
  }
  for (const dir of touchedDirs) {
    try {
      if (readdirSync(dir).length === 0) rmdirSync(dir);
    } catch {
      // leave the folder
    }
  }
  mkdirSync(join(queueFile, ".."), { recursive: true });
  const tmp = `${queueFile}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(queue, null, 2), "utf8");
  renameSync(tmp, queueFile);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const i = args.indexOf("--corpus");
  const corpusRoot = i >= 0 ? args[i + 1] : join(import.meta.dirname, "..", "..", "law-corpus");
  const actions = planMerge(corpusRoot);
  const count = (k: MergeAction["kind"]) => actions.filter((a) => a.kind === k).length;
  for (const a of actions) console.log(`${a.kind.padEnd(7)} ${a.from} → ${a.to}  (${a.reason})`);
  console.log(
    `\n${actions.length} Dateien: ${count("move")} verschieben, ${count("replace")} ersetzen, ${count("drop")} verwerfen.`
  );
  if (!apply) {
    console.log("Probelauf — nichts geändert. Mit --apply ausführen.");
  } else {
    applyMerge(corpusRoot, actions);
    console.log(
      "Ausgeführt; Import-/Lösch-Einträge stehen in _normalized/_import-warteschlange.json."
    );
  }
}
