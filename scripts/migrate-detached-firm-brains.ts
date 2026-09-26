/**
 * One-off repair: accounts whose personal brain is the shared brain of a firm
 * they are not a member of (a founder who left or was removed before
 * src/lib/auth/firm-brain.ts existed).
 *
 * Since that fix the app refuses such accounts everywhere (session, API key,
 * MCP token, calendar/DAV feed, realtime stream, cron recipients). This script
 * gives each of them a fresh, empty personal brain so they can sign in again
 * — the firm keeps its brain and data. Nothing is deleted.
 *
 * Default is a dry run that only lists the affected accounts.
 *
 * Required env:
 *   SUBSUMIO_AUTH_DATABASE_URL - Postgres connection string for the auth store
 *
 * Usage:
 *   bun run scripts/migrate-detached-firm-brains.ts            # dry run
 *   bun run scripts/migrate-detached-firm-brains.ts --apply    # write
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const url = process.env.SUBSUMIO_AUTH_DATABASE_URL;
const apply = process.argv.includes("--apply");

if (!url) {
  console.error("Missing SUBSUMIO_AUTH_DATABASE_URL");
  process.exit(1);
}

interface Row {
  user_id: string;
  user_org_id: string | null;
  brain_id: string;
  firm_id: string;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<Row>(
      `SELECT u.id AS user_id,
              u.data->>'orgId' AS user_org_id,
              u.data->>'brainId' AS brain_id,
              o.id AS firm_id
         FROM subsumio_users u
         JOIN subsumio_orgs o ON o.data->>'brainId' = u.data->>'brainId'
        WHERE COALESCE(u.data->>'orgId', '') <> o.id
        ORDER BY u.created_at ASC`
    );

    console.log(`${rows.length} account(s) hold a firm brain without being a member.`);
    for (const r of rows) {
      console.log(
        `  user=${r.user_id} firm=${r.firm_id} brain=${r.brain_id} user_org=${r.user_org_id ?? "-"}`
      );
    }
    if (!apply) {
      console.log("Dry run — nothing changed. Re-run with --apply to assign new personal brains.");
      return;
    }

    let changed = 0;
    for (const r of rows) {
      const next = `brain_${randomUUID().slice(0, 8)}`;
      // Guarded by the old brain id: a record changed meanwhile is left alone.
      const res = await pool.query(
        `UPDATE subsumio_users
            SET data = jsonb_set(data, '{brainId}', to_jsonb($2::text)),
                updated_at = now()
          WHERE id = $1 AND data->>'brainId' = $3`,
        [r.user_id, next, r.brain_id]
      );
      if (res.rowCount === 1) {
        changed++;
        console.log(`  user=${r.user_id}: new personal brain ${next}`);
      }
    }
    console.log(`${changed} account(s) updated.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
