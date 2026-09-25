/**
 * Pure helpers for approval decisions in the operations cockpit.
 *
 * Every rejection — single or bulk — needs a reason written by the user; a bulk
 * rejection must not fall back to a generic placeholder text.
 */

export interface RejectRequest {
  actionSlug: string;
  decision: "rejected";
  reason: string;
}

/** One reject request per slug, or `null` when the reason is blank. */
export function buildRejectRequests(slugs: string[], reason: string): RejectRequest[] | null {
  const trimmed = reason.trim();
  if (!trimmed || slugs.length === 0) return null;
  return slugs.map((actionSlug) => ({ actionSlug, decision: "rejected", reason: trimmed }));
}

/** Confirmation text before approving (and executing) one or more actions. */
export function approveConfirmOptions(count: number, lang: string) {
  const en = lang === "en";
  if (count === 1) {
    return {
      title: en ? "Approve action?" : "Aktion freigeben?",
      message: en
        ? "The approved action is executed immediately."
        : "Die freigegebene Aktion wird sofort ausgeführt.",
      confirmLabel: en ? "Approve" : "Freigeben",
    };
  }
  return {
    title: en ? `Approve ${count} actions?` : `${count} Aktionen freigeben?`,
    message: en
      ? `All ${count} selected actions are executed immediately.`
      : `Alle ${count} ausgewählten Aktionen werden sofort ausgeführt.`,
    confirmLabel: en ? "Approve all" : "Alle freigeben",
  };
}
