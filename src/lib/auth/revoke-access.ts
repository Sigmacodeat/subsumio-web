/**
 * Ends every standing access of one account at once — used when a person is
 * deactivated (SCIM, operator) so nothing keeps working until it happens to
 * be checked again:
 *
 *   - browser sessions (version floor + session registry, push tokens);
 *   - API keys are switched off, add-in tokens deleted (both are also refused
 *     at use for a deactivated account; this makes the cut permanent — a
 *     reactivated account gets new keys, not the old ones back).
 *
 * MCP tokens are not listed here: the engine asks the web app on every use
 * whether the creator may still work in the firm (engine-user-status), and a
 * deactivated account answers "inactive".
 *
 * Each step runs even when an earlier one failed; the first error is thrown
 * afterwards so callers can report it.
 */

import { getApiKeyStore } from "@/lib/api-key-store";
import { revokeAllSessions } from "@/lib/auth/session";

export async function revokeUserAccess(userId: string): Promise<{ keysRevoked: number }> {
  let firstError: unknown = null;
  let keysRevoked = 0;

  try {
    await revokeAllSessions(userId);
  } catch (err) {
    firstError ??= err;
  }

  try {
    const store = getApiKeyStore();
    for (const key of await store.listByOwner(userId)) {
      try {
        if (key.kind === "addin") {
          await store.delete(key.id);
          keysRevoked++;
        } else if (key.active) {
          await store.update(key.id, { active: false });
          keysRevoked++;
        }
      } catch (err) {
        firstError ??= err;
      }
    }
  } catch (err) {
    firstError ??= err;
  }

  if (firstError) throw firstError;
  return { keysRevoked };
}
