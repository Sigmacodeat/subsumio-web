#!/usr/bin/env bun
/**
 * Dates the older versions of federal and state norms.
 *
 * RIS gives every consolidated version of a paragraph its own document
 * number. The fetchers download the version in force; when RIS publishes a
 * new one, the page of the previous version stays in the database — without
 * an end date, so search and reconciliation count it as law in force.
 *
 * For each paragraph (state, law number, paragraph) all versions are ordered
 * by their start date. A version that is no longer in the RIS in-force
 * inventory and has a later version ends the day before that later version
 * takes effect: in_force_to = next.in_force_from − 1 day, superseded_by =
 * next doc_id. A version without a later one (paragraph repealed outright)
 * gets no invented date; it is counted and listed.
 *
 *   bun scripts/mark-superseded-versions.ts --source law-at-landesrecht            # report
 *   bun scripts/mark-superseded-versions.ts --source law-at-landesrecht --apply    # write
 *
 * Inventories: _state/ris-inforce-landesrecht.jsonl (fetch-at-landesrecht-xml.ts),
 * _state/ris-inforce.jsonl (ris-inforce-crawl.ts).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { landOfDocId } from "./normalize/normalize-corpus";
import { writeIngestLog } from "./ingest-log";

export interface Version {
  id: number;
  slug: string;
  title: string | null;
  docId: string;
  statuteId: string | null;
  paragraphRef: string | null;
  inForceFrom: string | null;
  inForceTo: string | null;
}

export interface Superseded {
  version: Version;
  inForceTo: string;
  supersededBy: string;
}

/** Same paragraph of the same law of the same state, whatever the formatting. */
export function paragraphKey(
  v: Pick<Version, "docId" | "statuteId" | "paragraphRef">
): string | null {
  if (!v.statuteId || !v.paragraphRef) return null;
  const land = landOfDocId(v.docId) ?? "bund";
  const gnr = v.statuteId.replace(/^[a-z]+-/, "");
  const par = v.paragraphRef.toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  return `${land}|${gnr}|${par}`;
}

export function dayBefore(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Versions not in force at RIS that have a later version, with their end
 * date; plus those without one (repealed outright or not comparable).
 */
export function findSuperseded(
  versions: Version[],
  inForce: Set<string>
): { superseded: Superseded[]; withoutSuccessor: Version[] } {
  const byKey = new Map<string, Version[]>();
  const withoutSuccessor: Version[] = [];
  for (const v of versions) {
    const key = paragraphKey(v);
    if (!key) {
      if (!inForce.has(v.docId) && !v.inForceTo) withoutSuccessor.push(v);
      continue;
    }
    const list = byKey.get(key) ?? [];
    list.push(v);
    byKey.set(key, list);
  }
  const superseded: Superseded[] = [];
  for (const list of byKey.values()) {
    const dated = list
      .filter((v) => v.inForceFrom)
      .sort((a, b) => a.inForceFrom!.localeCompare(b.inForceFrom!));
    for (const v of list) {
      if (inForce.has(v.docId) || v.inForceTo) continue;
      const next = v.inForceFrom
        ? dated.find((n) => n.inForceFrom! > v.inForceFrom! && n.docId !== v.docId)
        : undefined;
      if (next)
        superseded.push({
          version: v,
          inForceTo: dayBefore(next.inForceFrom!),
          supersededBy: next.docId,
        });
      else withoutSuccessor.push(v);
    }
  }
  return { superseded, withoutSuccessor };
}

const INVENTORIES: Record<string, { file: string; idOf: (row: any) => string | undefined }> = {
  "law-at-landesrecht": { file: "ris-inforce-landesrecht.jsonl", idOf: (r) => r.nor ?? r.id },
  "law-at-normen": { file: "ris-inforce.jsonl", idOf: (r) => r.nor },
};

async function main() {
  const args = process.argv.slice(2);
  const source = args[args.indexOf("--source") + 1];
  const apply = args.includes("--apply");
  const inv = INVENTORIES[source];
  if (!inv) throw new Error(`--source ${Object.keys(INVENTORIES).join(" | ")}`);
  const root = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dirname, "..", "..", "law-corpus");
  const file = join(root, "_state", inv.file);
  if (!existsSync(file)) throw new Error(`Inventar fehlt: ${file}`);
  const inForce = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const id = inv.idOf(JSON.parse(line));
    if (id) inForce.add(id);
  }

  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured.");
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  const rows = (await engine.executeRaw(
    `SELECT id, slug, title, frontmatter->>'doc_id' AS doc_id, frontmatter->>'statute_id' AS statute_id,
            frontmatter->>'paragraph_ref' AS paragraph_ref,
            nullif(frontmatter->>'in_force_from', '') AS f, nullif(frontmatter->>'in_force_to', '') AS t
     FROM pages WHERE source_id = $1 AND deleted_at IS NULL AND frontmatter->>'doc_id' IS NOT NULL`,
    [source]
  )) as any[];
  const versions: Version[] = rows.map((r) => ({
    id: Number(r.id),
    slug: r.slug,
    title: r.title,
    docId: r.doc_id,
    statuteId: r.statute_id,
    paragraphRef: r.paragraph_ref,
    inForceFrom: r.f,
    inForceTo: r.t,
  }));
  const { superseded, withoutSuccessor } = findSuperseded(versions, inForce);
  console.log(
    `${source}: ${versions.length} aktive Seiten, ${inForce.size} geltend laut RIS-Inventar\n` +
      `  ältere Fassung mit Nachfolger (bekommt Ende-Datum): ${superseded.length}\n` +
      `  nicht mehr geltend, ohne Nachfolger (kein Datum erfunden): ${withoutSuccessor.length}`
  );
  for (const s of superseded.slice(0, 5)) {
    console.log(
      `    ${s.version.docId} bis ${s.inForceTo} → ${s.supersededBy}  (${s.version.slug})`
    );
  }

  if (apply && superseded.length > 0) {
    for (let i = 0; i < superseded.length; i += 1000) {
      const batch = superseded.slice(i, i + 1000);
      await engine.executeRaw(
        `UPDATE pages p SET frontmatter = p.frontmatter
                || jsonb_build_object('in_force_to', u.t, 'superseded_by', u.b),
                updated_at = now()
         FROM unnest($1::int[], $2::text[], $3::text[]) AS u(id, t, b)
         WHERE p.id = u.id AND p.deleted_at IS NULL`,
        [
          batch.map((s) => s.version.id),
          batch.map((s) => s.inForceTo),
          batch.map((s) => s.supersededBy),
        ]
      );
      await writeIngestLog(
        engine,
        batch.map((s) => ({
          source_id: source,
          doc_id: s.version.docId,
          slug: s.version.slug,
          title: s.version.title,
          action: "updated" as const,
          origin: "mark-superseded-versions",
          detail: { in_force_to: s.inForceTo, superseded_by: s.supersededBy },
        }))
      );
    }
    console.log(`  ${superseded.length} Fassungen datiert.`);
  }
  await engine.disconnect();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
