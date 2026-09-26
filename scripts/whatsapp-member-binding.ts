/**
 * One-off: bind existing WhatsApp staff numbers to the firm member who owns
 * them (member_user_id).
 *
 * Staff numbers now act for their owner — that person's walls and document
 * ACL apply. Numbers created before carry only the person who CREATED the
 * entry (user_id), which is not the owner. Until a member is assigned, such a
 * number gets no matter or brain access from WhatsApp (it answers with a
 * notice to have the number assigned on the WhatsApp page of the dashboard).
 *
 * The dry run lists every unbound staff number and a suggestion: the one
 * active staff member of the same firm whose name equals the number's name
 * (case-insensitive). `--apply` writes ONLY those unique name matches; the
 * creator is never used. Everything else is assigned by the firm in the UI.
 *
 * Required env:
 *   SUBSUMIO_AUTH_DATABASE_URL - Postgres connection string for the auth store
 *
 * Usage:
 *   bun run scripts/whatsapp-member-binding.ts            # dry run
 *   bun run scripts/whatsapp-member-binding.ts --apply    # write unique matches
 */
import { Pool } from "pg";

const url = process.env.SUBSUMIO_AUTH_DATABASE_URL;
const apply = process.argv.includes("--apply");

if (!url) {
  console.error("Missing SUBSUMIO_AUTH_DATABASE_URL");
  process.exit(1);
}

interface IdentityRow {
  id: string;
  org_id: string;
  brain_id: string;
  name: string | null;
  role: string;
}

interface MemberRow {
  id: string;
  name: string | null;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: url });
  try {
    const { rows: col } = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subsumio_whatsapp_identities' AND column_name = 'member_user_id'`
    );
    const hasColumn = col.length > 0;
    if (!hasColumn && apply) {
      await pool.query(
        `ALTER TABLE subsumio_whatsapp_identities ADD COLUMN IF NOT EXISTS member_user_id text`
      );
    }

    const { rows: identities } = await pool.query<IdentityRow>(
      `SELECT id, org_id, brain_id, name, role
         FROM subsumio_whatsapp_identities
        WHERE role NOT IN ('client', 'external', 'intake')
          AND status = 'active'
          ${hasColumn ? "AND member_user_id IS NULL" : ""}
        ORDER BY org_id, created_at`
    );
    console.log(`${identities.length} active staff number(s) without an owning member.`);

    let written = 0;
    for (const identity of identities) {
      // Staff accounts working in this number's firm (or the solo account of its brain).
      const { rows: members } = await pool.query<MemberRow>(
        `SELECT id, data->>'name' AS name
           FROM subsumio_users
          WHERE (data->>'orgId' = $1
                 OR (COALESCE(data->>'orgId', '') = '' AND data->>'brainId' = $2))
            AND data->>'role' IN ('admin', 'lawyer', 'assistant')
            AND COALESCE(data->>'deactivatedAt', '') = ''
            AND COALESCE(data->>'deletedAt', '') = ''`,
        [identity.org_id, identity.brain_id]
      );
      const wanted = (identity.name ?? "").trim().toLowerCase();
      const matches = wanted
        ? members.filter((m) => (m.name ?? "").trim().toLowerCase() === wanted)
        : [];
      const suggestion = matches.length === 1 ? matches[0].id : null;
      console.log(
        `  number=${identity.id} firm=${identity.org_id} role=${identity.role} ` +
          `members=${members.length} suggestion=${suggestion ?? "- (assign in the UI)"}`
      );
      if (apply && suggestion) {
        const res = await pool.query(
          `UPDATE subsumio_whatsapp_identities
              SET member_user_id = $2, updated_at = now()
            WHERE id = $1 AND member_user_id IS NULL`,
          [identity.id, suggestion]
        );
        written += res.rowCount ?? 0;
      }
    }
    if (!apply) {
      console.log("Dry run — nothing changed. Re-run with --apply to write the unique matches.");
      return;
    }
    console.log(`${written} number(s) bound to a member.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
