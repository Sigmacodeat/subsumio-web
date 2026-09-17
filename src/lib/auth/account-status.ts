// One answer to "may this account work right now?" for every place that
// issues or reads a session. An account is blocked when it was deactivated
// (by its firm, by SCIM, or by a firm suspension) or when its firm is
// suspended by the platform operator.

import { getOrgStore, type User } from "@/lib/auth/store";

export const ACCOUNT_BLOCKED_CODE = "account_deactivated";
export const ACCOUNT_BLOCKED_MESSAGE =
  "Dieses Konto ist gesperrt. Bitte wenden Sie sich an Ihre Kanzlei oder an support@subsum.io.";

export async function isAccountBlocked(
  user: Pick<User, "deactivatedAt" | "orgId"> | null | undefined
): Promise<boolean> {
  if (!user) return true;
  if (user.deactivatedAt) return true;
  if (!user.orgId) return false;
  const org = await getOrgStore().getById(user.orgId);
  return Boolean(org?.suspendedAt);
}
