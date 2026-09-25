/**
 * What the data-export page tells the firm about a downloaded backup. A
 * backup is only called complete when the server said so (`complete: true`);
 * anything else — including a missing flag — is shown as incomplete, with
 * every reason the server gave.
 */

export interface BackupMetadata {
  complete?: unknown;
  total_pages?: unknown;
  expected_pages?: unknown;
  pages_without_content?: unknown;
  warning?: unknown;
  truncated_warning?: unknown;
  count_warning?: unknown;
}

export type BackupNotice =
  | { kind: "complete"; message: string }
  | { kind: "incomplete"; message: string; reasons: string[] };

function count(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function backupNotice(meta: BackupMetadata | null | undefined): BackupNotice {
  const total = count(meta?.total_pages);
  const totalLabel = total === null ? "" : ` (${total.toLocaleString("de-AT")} Einträge)`;
  if (meta?.complete === true) {
    return {
      kind: "complete",
      message: `Sicherung vollständig heruntergeladen${totalLabel}.`,
    };
  }
  const reasons: string[] = [];
  for (const text of [meta?.warning, meta?.truncated_warning, meta?.count_warning]) {
    if (typeof text === "string" && text.trim()) reasons.push(text.trim());
  }
  const withoutContent = count(meta?.pages_without_content);
  if (withoutContent && withoutContent > 0) {
    reasons.push(
      `${withoutContent.toLocaleString("de-AT")} ${withoutContent === 1 ? "Eintrag" : "Einträge"} ohne Text — der Text konnte nicht gelesen werden`
    );
  }
  if (reasons.length === 0) reasons.push("Die Vollständigkeit wurde vom Server nicht bestätigt");
  return {
    kind: "incomplete",
    message: `Achtung: Die Sicherung ist unvollständig${totalLabel}. Verlassen Sie sich für Umzug oder Archivierung nicht auf diese Datei.`,
    reasons,
  };
}
