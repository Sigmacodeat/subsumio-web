/**
 * EU AI Act Art. 50 — Transparenzkennzeichnung von KI-Output.
 *
 * KI-generierte Inhalte müssen sowohl für Nutzer sichtbar als auch
 * maschinenlesbar als KI-Output erkennbar sein. Diese Konstanten sind die
 * EINE Quelle für die Kennzeichnung — sie reiten in jeden Export, jedes
 * gespeicherte Frontmatter und jeden sichtbaren Badge mit, statt pro Seite
 * dupliziert zu werden.
 */

/** Vollständiger Hinweistext (Export, Fußnote, gespeichertes Frontmatter). */
export const AI_NOTICE =
  "KI-generierter Entwurf — anwaltlich zu prüfen und freizugeben (EU AI Act Art. 50). Erstellt mit Sigmabrain.";

/** Kurzes Label für den sichtbaren Badge. */
export const AI_BADGE_LABEL = "KI-generiert · zu prüfen";

/**
 * Frontmatter-Felder, die jeden KI-generierten Brain-Page als solchen
 * markieren — maschinenlesbarer Teil der Art.-50-Kennzeichnung.
 */
export const AI_FRONTMATTER = {
  ai_generated: true,
  ai_notice: AI_NOTICE,
} as const;
