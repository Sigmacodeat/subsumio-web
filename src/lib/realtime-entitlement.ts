/**
 * May an open realtime stream keep running? Asked periodically by the SSE
 * route: the account must still work (not deactivated, firm not suspended),
 * still have the role and still resolve to the brain the stream was opened
 * for (not removed from the firm). Anything unknown — including store errors
 * — is a no; the browser reconnects and is checked afresh.
 */
import { isAccountBlocked } from "@/lib/auth/account-status";
import { getStore } from "@/lib/auth/store";
import { firmBrainIdFor } from "@/lib/engine";

export const SSE_RECHECK_INTERVAL_MS = 60_000;

export async function sseStreamStillAllowed(stream: {
  userId: string;
  brainId: string;
  role: string | null | undefined;
}): Promise<boolean> {
  try {
    const user = await getStore().getById(stream.userId);
    if (!user || (await isAccountBlocked(user))) return false;
    if ((user.role ?? null) !== (stream.role ?? null)) return false;
    return (await firmBrainIdFor(user)) === stream.brainId;
  } catch {
    return false;
  }
}
