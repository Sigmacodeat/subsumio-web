/**
 * WP-7.45: Agentic Vault Organization — schlägt Akten-Ordner für Dokumente
 * vor (DACH-Kanzlei-Taxonomie) und plant Einordnungen. Deterministisch
 * und reviewbar: jede Zuordnung ist eine Vorschlags-Regel, kein Blackbox-LLM.
 * Rein/funktional, unit-testbar.
 */

import { inferUploadRouting } from "./upload-routing";

export interface VaultDoc {
  /** Eindeutiger Schlüssel — Doc-Page-Slug oder URL. */
  key: string;
  name: string;
  doc_type?: string;
  kind?: string;
  source?: string;
  mime_type?: string;
  /** Bereits gesetzter Ordner (aus der Doc-Page-Frontmatter). */
  folder?: string;
}

export interface FolderAssignment {
  key: string;
  name: string;
  folder: string;
  reason: string;
}

/** Kanonische Ordner der Akte — Reihenfolge = UI-Sortierung. */
export const VAULT_FOLDER_ORDER = [
  "Schriftsätze",
  "Gerichtliche Entscheidungen",
  "Korrespondenz",
  "Verträge",
  "Beweise & Gutachten",
  "Vollmachten & Identität",
  "Finanzen",
  "Protokolle & Notizen",
  "Sonstiges",
] as const;

const DOC_TYPE_TO_FOLDER: Record<string, string> = {
  klage: "Schriftsätze",
  schriftsatz: "Schriftsätze",
  urteil: "Gerichtliche Entscheidungen",
  bescheid: "Gerichtliche Entscheidungen",
  vertrag: "Verträge",
  rechnung: "Finanzen",
  mahnung: "Finanzen",
  vollmacht: "Vollmachten & Identität",
  gutachten: "Beweise & Gutachten",
  protokoll: "Protokolle & Notizen",
};

const KIND_TO_FOLDER: Record<string, string> = {
  email: "Korrespondenz",
  letter: "Korrespondenz",
  correspondence: "Korrespondenz",
  contract: "Verträge",
  invoice: "Finanzen",
  evidence: "Beweise & Gutachten",
};

/**
 * Schlägt einen Ordner für ein Dokument vor. Gibt null zurück, wenn kein
 * belastbares Signal vorliegt — das Dokument bleibt dann ungeordnet statt
 * geraten zugeordnet zu werden.
 */
export function suggestFolder(doc: Pick<VaultDoc, "name" | "doc_type" | "kind" | "source">): {
  folder: string;
  reason: string;
} | null {
  const docType = doc.doc_type?.toLowerCase().trim();
  if (docType && DOC_TYPE_TO_FOLDER[docType]) {
    return { folder: DOC_TYPE_TO_FOLDER[docType], reason: `Typ: ${docType}` };
  }

  const kind = doc.kind?.toLowerCase().trim();
  if (kind && KIND_TO_FOLDER[kind]) {
    return { folder: KIND_TO_FOLDER[kind], reason: `Art: ${kind}` };
  }

  // Filename-Heuristik über die bestehende Upload-Routing-Erkennung.
  const routing = inferUploadRouting(doc.name);
  if (routing.docType && DOC_TYPE_TO_FOLDER[routing.docType]) {
    return {
      folder: DOC_TYPE_TO_FOLDER[routing.docType],
      reason: `Dateiname: ${routing.docType}`,
    };
  }

  // Quellen-Signale (Portal-Uploads, Mail-Import, Scan-Eingang).
  const source = doc.source?.toLowerCase() ?? "";
  if (source.includes("portal") || source.includes("client")) {
    return { folder: "Korrespondenz", reason: "Quelle: Mandantenportal" };
  }
  if (source.includes("email") || source.includes("mail")) {
    return { folder: "Korrespondenz", reason: "Quelle: E-Mail" };
  }
  if (source.includes("scan")) {
    return { folder: "Korrespondenz", reason: "Quelle: Scan-Eingang" };
  }

  return null;
}

/**
 * Plant die Einordnung eines Dokumentenbestands. Standardmäßig werden nur
 * Dokumente OHNE Ordner eingeordnet (`onlyUnsorted`) — bestehende,
 * manuelle Zuordnungen werden nie überschrieben, außer `overwrite` ist
 * explizit gesetzt.
 */
export function planVaultOrganization(
  docs: readonly VaultDoc[],
  opts: { onlyUnsorted?: boolean; overwrite?: boolean } = {}
): FolderAssignment[] {
  const onlyUnsorted = opts.onlyUnsorted !== false;
  const overwrite = opts.overwrite === true;

  const assignments: FolderAssignment[] = [];
  for (const doc of docs) {
    if (doc.folder && (onlyUnsorted || !overwrite)) continue;
    const suggestion = suggestFolder(doc);
    if (suggestion && suggestion.folder !== doc.folder) {
      assignments.push({
        key: doc.key,
        name: doc.name,
        folder: suggestion.folder,
        reason: suggestion.reason,
      });
    }
  }
  return assignments;
}
