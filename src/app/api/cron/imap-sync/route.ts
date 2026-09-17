import type { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { mapWithConcurrency } from "@/lib/cron-utils";
import { listEnabledMailAccounts } from "@/lib/email/imap-accounts";
import { syncImapAccount } from "@/lib/email/imap-sync";
import { logger } from "@/lib/logger";

const log = logger("api/cron/imap-sync");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every 5 minutes (server/deploy/hetzner/crontab): fetch new mail for all connected mailboxes. */
export const GET = createCronHandler(async (_req: NextRequest) => {
  let accounts;
  try {
    accounts = await listEnabledMailAccounts();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "mail_accounts_database_not_configured") {
      return Response.json({ ok: true, accounts: 0, skipped: "no_database" });
    }
    throw err;
  }
  const settled = await mapWithConcurrency(accounts, (a) => syncImapAccount(a), 3);
  const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const summary = {
    accounts: accounts.length,
    stored: results.reduce((n, r) => n + r.stored, 0),
    assigned: results.reduce((n, r) => n + r.assigned, 0),
    failed: settled.length - results.length + results.filter((r) => r.error).length,
  };
  log.info("imap sync run", summary);
  return Response.json({ ok: true, ...summary });
});
