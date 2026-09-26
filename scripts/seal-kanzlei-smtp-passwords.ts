/**
 * One-off migration: encrypt SMTP passwords that Kanzlei settings pages still
 * hold in plaintext (saved before the password was stored encrypted).
 *
 * The server seals such a password on its first server-side read anyway
 * (src/lib/kanzlei-settings-server.ts); this walks every brain once so no
 * plaintext is left waiting for that read (backups, exports).
 *
 * Dry run by default — only reports. Writes only with --apply. Runs with the
 * web app's environment (engine URL + API key, auth store, and
 * SUBSUMIO_ENCRYPTION_KEY — without the key nothing is written).
 *
 * Usage (from the repo root, inside the web container's environment):
 *   npx tsx scripts/seal-kanzlei-smtp-passwords.ts            # dry run
 *   npx tsx scripts/seal-kanzlei-smtp-passwords.ts --apply    # write
 *   npx tsx scripts/seal-kanzlei-smtp-passwords.ts --brain <brainId> [--apply]
 */
import { getOrgStore, getStore } from "../src/lib/auth/store";
import { sealLegacySmtpPassword, type SmtpSealOutcome } from "../src/lib/kanzlei-settings-server";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Every brain a settings page can live in: personal brains and firm brains. */
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
    `[seal-smtp] ${apply ? "APPLY" : "DRY RUN"} — ${brainIds.length} brain(s)${apply ? "" : " (nothing is written; pass --apply)"}`
  );

  const counts: Record<SmtpSealOutcome, number> = {
    sealed: 0,
    cleared: 0,
    would_seal: 0,
    not_needed: 0,
    no_key: 0,
    failed: 0,
  };
  for (const brainId of brainIds) {
    let outcome: SmtpSealOutcome;
    try {
      outcome = await sealLegacySmtpPassword(brainId, { trigger: "migration", dryRun: !apply });
    } catch (err) {
      console.error(`[seal-smtp] ${brainId}: ${err instanceof Error ? err.message : String(err)}`);
      outcome = "failed";
    }
    counts[outcome]++;
    if (outcome !== "not_needed") console.log(`[seal-smtp] ${brainId}: ${outcome}`);
  }

  console.log(`[seal-smtp] done: ${JSON.stringify(counts)}`);
  if (counts.no_key > 0) {
    console.error(
      "[seal-smtp] SUBSUMIO_ENCRYPTION_KEY is not set — plaintext passwords were found but not sealed."
    );
  }
  process.exit(counts.failed > 0 || counts.no_key > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[seal-smtp] aborted:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
