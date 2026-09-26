import type { DashboardKey } from "@/content/dashboard";
import { ApiMutationError } from "@/lib/queries/settings";

const ERROR_KEYS: Record<string, string> = {
  already_in_org: "team.error_already_in_org",
  invalid_name: "team.error_invalid_name",
  owner_only: "team.error_owner_only",
  owner_must_stay_admin: "team.error_owner_must_stay_admin",
  last_admin: "team.error_last_admin",
  last_admin_cannot_change_role: "team.error_last_admin",
  not_in_your_org: "team.error_not_in_your_org",
  self_invite: "team.error_self_invite",
  no_seats_left: "__TEAM_SEAT_LIMIT__",
  already_member: "team.error_already_member",
  invalid_email: "team.error_invalid_email",
  owner_must_remove_members_first: "team.error_owner_remove_members",
  owner_cannot_remove_self: "team.error_owner_cannot_remove",
  rate_limited: "team.error_rate_limited",
  generic: "team.error_generic",
};

function errMsg(t: (key: DashboardKey) => string, code?: string): string {
  const key = ERROR_KEYS[code ?? ""] ?? ERROR_KEYS.generic;
  return key === "__TEAM_SEAT_LIMIT__" ? "__TEAM_SEAT_LIMIT__" : t(key as DashboardKey);
}

/**
 * User-facing text for a failed team mutation. Known server codes map to their
 * translated text; an unknown code falls back to the server's own message.
 */
export function teamErrorText(t: (key: DashboardKey) => string, err: unknown): string {
  const code = err instanceof ApiMutationError ? err.code : undefined;
  if (code && ERROR_KEYS[code]) {
    const raw = errMsg(t, code);
    return raw === "__TEAM_SEAT_LIMIT__" ? t("team.seat_limit_reached") : raw;
  }
  if (err instanceof Error && err.message) return err.message;
  return errMsg(t);
}
