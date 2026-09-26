/**
 * One-off repair: pipeline deadlines whose due date was shifted by the old
 * pipeline sync.
 *
 * The sync (src/lib/legal/pipeline-sync.ts) used to treat the date of a
 * deadline-calendar row — which is the Fristende as written in the file — as
 * the service date and computed a new Fristende from it. The stored `due_date`
 * therefore lies one full deadline period too late. The page slug still
 * carries the original date (`legal/deadlines/<YYYY-MM-DD>-…`).
 *
 * Only unreviewed, open pages written by that sync are touched
 * (`source: pipeline`, `deterministic: true`, no `pipeline_datum`); anything a
 * person approved, completed or rejected stays as it is. The correction sets
 * `due_date` / `fristende` back to the date from the file, recomputes the
 * Vorfrist and records the previous value in `pipeline_datum_korrektur`.
 * The pages stay "unreviewed".
 *
 * Dry run by default — only reports. Writes only with --apply. Runs with the
 * web app's environment (engine URL + API key, auth store).
 *
 * Usage (from the repo root, inside the web container's environment):
 *   npx tsx scripts/repair-pipeline-deadline-dates.ts            # dry run
 *   npx tsx scripts/repair-pipeline-deadline-dates.ts --apply    # write
 *   npx tsx scripts/repair-pipeline-deadline-dates.ts --brain <brainId> [--apply]
 */
import { getOrgStore, getStore } from "../src/lib/auth/store";
import { engineHeadersForBrain, enginePatchPage } from "../src/lib/engine";
import { listEnginePages } from "../src/lib/engine-pages";
import {
  findShiftedPipelineDeadlines,
  type ExistingDeadlinePage,
} from "../src/lib/legal/pipeline-sync";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Every brain a deadline page can live in: personal brains and firm brains. */
async function allBrainIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const user of await getStore().list()) if (user.brainId) ids.add(user.brainId);
  for (const org of await getOrgStore().list()) if (org.brainId) ids.add(org.brainId);
  return [...ids].sort();
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const single = argValue("--brain");
  const brainIds = single ? [single] : await allBrainIds();

  console.log(
    `[repair-pipeline-dates] ${apply ? "APPLY" : "DRY RUN"} — ${brainIds.length} brain(s)${apply ? "" : " (nothing is written; pass --apply)"}`
  );

  let found = 0;
  let fixed = 0;
  let failed = 0;
  for (const brainId of brainIds) {
    const headers = engineHeadersForBrain(brainId);
    let pages: ExistingDeadlinePage[];
    try {
      pages = (await listEnginePages(headers, "legal_deadline", 100_000, {
        strict: true,
        failOnTruncate: true,
        frontmatter: { source: "pipeline" },
        timeoutMs: 30_000,
      })) as unknown as ExistingDeadlinePage[];
    } catch (err) {
      failed++;
      console.error(
        `[repair-pipeline-dates] ${brainId}: list failed — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    const repairs = findShiftedPipelineDeadlines(pages);
    found += repairs.length;
    for (const r of repairs) {
      console.log(
        `[repair-pipeline-dates] ${brainId} ${r.slug} (${r.caseSlug}, "${r.description}"): due_date ${r.wrongDueDate} → ${r.pipelineDate}`
      );
      if (!apply) continue;
      try {
        const res = await enginePatchPage(headers, {
          slug: r.slug,
          frontmatter: {
            due_date: r.pipelineDate,
            fristende: r.pipelineDate,
            pipeline_datum: r.pipelineDate,
            vorfrist_date: r.vorfristDate,
            deterministic: false,
            fristbeginn: null,
            kalendertage: null,
            pipeline_datum_korrektur: {
              vorher_due_date: r.wrongDueDate,
              korrigiert_am: new Date().toISOString(),
              grund:
                "Das Datum aus dem Fristenkalender ist das Fristende laut Akt; es war irrtümlich als Zustelldatum weiterberechnet worden.",
            },
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fixed++;
      } catch (err) {
        failed++;
        console.error(
          `[repair-pipeline-dates] ${brainId} ${r.slug}: write failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  console.log(
    `[repair-pipeline-dates] done: ${found} shifted deadline(s) found${apply ? `, ${fixed} corrected` : ""}, ${failed} failure(s)`
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(
    "[repair-pipeline-dates] aborted:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
