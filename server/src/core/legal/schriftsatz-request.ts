/**
 * Turns a Schriftsatz request (web: /api/legal/schriftsatz) into a think
 * request: the drafting brief becomes the retrieval query, the formal
 * requirements become system instructions. The think pipeline then supplies
 * matter-scoped evidence, statute retrieval and citation verification.
 */

const DOCUMENT_LABELS: Record<string, string> = {
  klage: "Klage",
  klageerwiderung: "Klagebeantwortung / Klageerwiderung",
  berufung: "Berufung",
  revision: "Revision",
  beschwerde: "Beschwerde / Rekurs",
  antrag: "Antrag",
  antwortschrift: "Berufungsbeantwortung / Antwortschrift",
  schriftsatz: "Schriftsatz",
};

const JURISDICTION_RULES: Record<string, string> = {
  at: "Österreichisches Recht und österreichische Verfahrensordnung (ZPO, AußStrG, JN). Zitierweise wie im RIS (z. B. § 1295 Abs 1 ABGB; OGH 1 Ob 123/24x).",
  de: "Deutsches Recht und deutsche Verfahrensordnung (ZPO, GVG). Zitierweise z. B. § 280 Abs. 1 BGB; BGH, Urt. v. … – Az.",
  ch: "Schweizer Recht und Schweizer Verfahrensordnung (ZPO-CH). Zitierweise z. B. Art. 41 Abs. 1 OR; BGE 145 III 72.",
};

export interface SchriftsatzThinkBody {
  query: string;
  instructions: string;
  case_slug: string;
  mode: "tokenmax";
}

export function buildSchriftsatzRequest(
  body: Record<string, unknown>
): SchriftsatzThinkBody | { error: string } {
  const caseSlug = typeof body.case_slug === "string" ? body.case_slug.trim() : "";
  const brief = typeof body.instructions === "string" ? body.instructions.trim() : "";
  if (!caseSlug) return { error: "case_slug_required" };
  if (!brief) return { error: "instructions_required" };

  const type = typeof body.document_type === "string" ? body.document_type : "schriftsatz";
  const label = DOCUMENT_LABELS[type] ?? "Schriftsatz";
  const jurisdiction = typeof body.jurisdiction === "string" ? body.jurisdiction : "at";
  const court = typeof body.court === "string" && body.court.trim() ? body.court.trim() : null;
  const fileNumber =
    typeof body.file_number === "string" && body.file_number.trim()
      ? body.file_number.trim()
      : null;
  const english = body.language === "en";

  const instructions = [
    `AUFGABE: Entwirf eine(n) ${label} für die aktive Akte. Ausgabe ist ein vollständiger, einreichungsnah formulierter Entwurf, KEINE Erklärung und KEIN Chat.`,
    JURISDICTION_RULES[jurisdiction] ?? JURISDICTION_RULES.at,
    court
      ? `Gericht: ${court}.`
      : "Gericht: aus der Akte übernehmen, sonst als [Gericht] markieren.",
    fileNumber
      ? `Aktenzeichen / GZ: ${fileNumber}.`
      : "Aktenzeichen: aus der Akte übernehmen, sonst als [GZ] markieren.",
    "AUFBAU: Rubrum (Gericht, Parteien mit Vertretern, GZ), Bezeichnung des Schriftsatzes, Anträge, Sachverhalt, rechtliche Begründung, Beweisanbote, Schlussantrag. Beweisanbote nur aus den Akten-Dokumenten.",
    "TATSACHEN: Nur Tatsachen verwenden, die in den abgerufenen Akten-Dokumenten stehen. Fehlende Angaben als [OFFEN: …] markieren, NIEMALS erfinden.",
    "NORMEN: Jede zitierte Norm und Entscheidung muss aus den abgerufenen Quellen stammen. Nicht belegbare Rechtsausführungen als [PRÜFEN: …] markieren.",
    "Am Ende: „Entwurf – anwaltlich zu prüfen. Nicht ohne Prüfung einreichen.“",
    english ? "Write the draft in English." : "Schreibe auf Deutsch.",
  ].join("\n");

  return {
    query: `${label}: ${brief}`.slice(0, 20_000),
    instructions,
    case_slug: caseSlug,
    mode: "tokenmax",
  };
}
