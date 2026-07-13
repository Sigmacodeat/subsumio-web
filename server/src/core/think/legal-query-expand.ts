/**
 * Legal Query Expansion — maps colloquial German terms to their formal
 * legal equivalents so hybrid search finds the right statutes.
 *
 * Problem: Users ask "Wer haftet bei Hundebiss?" but § 1320 ABGB says
 * "Wird jemand durch ein Tier beschädigt". Keyword search misses because
 * "Hund" ≠ "Tier". Vector search sometimes bridges the gap but not
 * reliably when the query has many distracting terms.
 *
 * Solution: Detect colloquial terms in the query and append their legal
 * equivalents. The expanded query is used for BOTH keyword and vector
 * search, improving recall without changing the user's original question
 * (which is still sent to the LLM verbatim).
 *
 * This is a lightweight, zero-LLM-cost expansion — just a static synonym
 * map. It runs in the gather phase before hybridSearch.
 */

interface LegalSynonym {
  /** Colloquial term to detect (case-insensitive, word boundary). */
  colloquial: string;
  /** Legal equivalents to append. */
  legal: string[];
}

const LEGAL_SYNONYMS: LegalSynonym[] = [
  // Animals
  { colloquial: "hund", legal: ["Tier", "Tierhalter", "Tierhalterhaftung"] },
  { colloquial: "hundebiss", legal: ["Tier", "Tierhalter", "Tierhalterhaftung"] },
  { colloquial: "hundehalter", legal: ["Tierhalter", "Tierhalterhaftung"] },
  { colloquial: "katze", legal: ["Tier", "Tierhalter"] },
  { colloquial: "pferd", legal: ["Tier", "Tierhalter"] },
  { colloquial: "tier", legal: ["Tierhalter", "Tierhalterhaftung"] },
  // Vehicles
  { colloquial: "auto", legal: ["Kraftfahrzeug", "Fahrzeug", "Lenker"] },
  { colloquial: "pkw", legal: ["Kraftfahrzeug", "Fahrzeug"] },
  { colloquial: "lkw", legal: ["Kraftfahrzeug", "Fahrzeug"] },
  { colloquial: "autounfall", legal: ["Kraftfahrzeug", "Fahrzeug", "Unfall", "Schadenersatz"] },
  { colloquial: "verkehrsunfall", legal: ["Kraftfahrzeug", "Fahrzeug", "Unfall", "Schadenersatz"] },
  // Employment
  { colloquial: "arbeitgeber", legal: ["Dienstgeber", "Arbeitgeber"] },
  { colloquial: "arbeitnehmer", legal: ["Dienstnehmer", "Arbeitnehmer"] },
  { colloquial: "gehalt", legal: ["Entgelt", "Vergütung", "Lohn"] },
  { colloquial: "lohn", legal: ["Entgelt", "Vergütung", "Lohn"] },
  { colloquial: "kündigung", legal: ["Kündigung", "Entlassung", "Dienstbeendigung"] },
  { colloquial: "feuerung", legal: ["Kündigung", "Entlassung"] },
  // Medical
  { colloquial: "arzt", legal: ["Arzt", "Behandler", "Hebehandlung"] },
  { colloquial: "ärztin", legal: ["Arzt", "Behandler", "Hebehandlung"] },
  { colloquial: "krankenhaus", legal: ["Krankenanstalt", "Hebeanstalt"] },
  { colloquial: "spital", legal: ["Krankenanstalt"] },
  { colloquial: "behandlung", legal: ["Hebehandlung", "Behandlung"] },
  { colloquial: "körperverletzung", legal: ["Körperverletzung", "Verletzung", "Schmerzengeld"] },
  { colloquial: "schmerzensgeld", legal: ["Schmerzengeld", "Schadenersatz"] },
  { colloquial: "schmerzensgeld", legal: ["Schmerzengeld", "Schadenersatz"] },
  // Family
  { colloquial: "kind", legal: ["Kind", "Minderjähriger", "Erziehungsberechtigter"] },
  { colloquial: "kinder", legal: ["Kind", "Minderjähriger"] },
  { colloquial: "eltern", legal: ["Eltern", "Erziehungsberechtigte"] },
  { colloquial: "mutter", legal: ["Mutter", "Elternteil"] },
  { colloquial: "vater", legal: ["Vater", "Elternteil"] },
  { colloquial: "ehe", legal: ["Ehe", "Ehegatte", "Ehepartner"] },
  { colloquial: "ehefrau", legal: ["Ehegattin", "Ehegatte"] },
  { colloquial: "ehemann", legal: ["Ehegatte", "Ehemann"] },
  { colloquial: "scheidung", legal: ["Scheidung", "Eheauflösung", "Aufhebung"] },
  { colloquial: "unterhalt", legal: ["Unterhalt", "Unterhaltspflicht", "Alimente"] },
  // Property / Contract
  { colloquial: "wohnung", legal: ["Wohnung", "Mietraum", "Bestandobjekt"] },
  { colloquial: "haus", legal: ["Gebäude", "Liegenschaft", "Immobilie"] },
  { colloquial: "miete", legal: ["Miete", "Bestandvertrag", "Mietvertrag"] },
  { colloquial: "vertrag", legal: ["Vertrag", "Rechtsgeschäft", "Vereinbarung"] },
  { colloquial: "firma", legal: ["Unternehmen", "Gesellschaft", "Firma"] },
  { colloquial: "geschäft", legal: ["Unternehmen", "Geschäft", "Rechtsgeschäft"] },
  { colloquial: "geld", legal: ["Geld", "Vermögen", "Schadenersatz"] },
  { colloquial: "schaden", legal: ["Schaden", "Schadenersatz", "Ersatz"] },
  { colloquial: "haftung", legal: ["Haftung", "Ersatzpflicht", "Schadenersatz"] },
  { colloquial: "schuld", legal: ["Schuld", "Verbindlichkeit", "Haftung"] },
  // Government / Admin
  { colloquial: "amt", legal: ["Behörde", "Amt", "Organ"] },
  { colloquial: "behörde", legal: ["Behörde", "Amt", "Organ"] },
  { colloquial: "beamter", legal: ["Organ", "Bediensteter", "Beamter"] },
  { colloquial: "bund", legal: ["Bund", "Republik", "Staat"] },
  // Criminal (general — AT-specific criminal terms below)
  { colloquial: "raub", legal: ["Raub", "Entwendung", "Gewalt"] },
  // Civil procedure (general — AT-specific procedural terms below)
  { colloquial: "prozess", legal: ["Verfahren", "Prozess", "Rechtsstreit"] },
  { colloquial: "gericht", legal: ["Gericht", "Rechtsprechung", "Instanz"] },
  { colloquial: "revision", legal: ["Revision", "Rechtsmittel"] },
  { colloquial: "einspruch", legal: ["Einspruch", "Widerspruch", "Rechtsmittel"] },
  // Deadlines / Limitation
  { colloquial: "frist", legal: ["Frist", "Termin", "Fristenlauf"] },
  { colloquial: "verjährt", legal: ["Verjährung", "Verjährt", "Fristablauf"] },
  // Inheritance
  { colloquial: "erbe", legal: ["Erbe", "Erbfolge", "Verlassenschaft"] },
  { colloquial: "erbfolge", legal: ["Erbfolge", "Verlassenschaft", "Erbrecht"] },
  { colloquial: "testament", legal: ["Testament", "Letztwillige Verfügung", "Erbvertrag"] },
  { colloquial: "erbschaft", legal: ["Verlassenschaft", "Erbfolge", "Erbschaft"] },
  // AT Family law (EheG)
  { colloquial: "scheidung", legal: ["Scheidung", "Eheauflösung", "Ehescheidung", "Zerrüttung"] },
  { colloquial: "ehescheidung", legal: ["Scheidung", "Eheauflösung", "Ehescheidung"] },
  { colloquial: "zerrüttung", legal: ["Zerrüttung", "Eheauflösung", "Scheidung"] },
  { colloquial: "ehegatte", legal: ["Ehegatte", "Ehepartner", "Ehegattin"] },
  { colloquial: "ehegatten", legal: ["Ehegatte", "Ehepartner"] },
  { colloquial: "unterhalt", legal: ["Unterhalt", "Unterhaltspflicht", "Alimente", "Unterhaltsanspruch"] },
  // AT Corporate law (GmbHG, AktG)
  { colloquial: "gmbh", legal: ["Gesellschaft mit beschränkter Haftung", "GmbH", "Gesellschaftsrecht"] },
  { colloquial: "geschäftsführer", legal: ["Geschäftsführer", "Organ", "Vertretung", "Geschäftsführung"] },
  { colloquial: "mindesteinlage", legal: ["Mindesteinlage", "Stammeinlage", "Einlage", "Gesellschaftsanteil"] },
  { colloquial: "einlage", legal: ["Einlage", "Stammeinlage", "Mindesteinlage", "Gesellschaftsanteil"] },
  { colloquial: "aktiengesellschaft", legal: ["Aktiengesellschaft", "AktG", "Grundkapital", "Aktionär"] },
  { colloquial: "ag", legal: ["Aktiengesellschaft", "Grundkapital", "Vorstand"] },
  { colloquial: "vorstand", legal: ["Vorstand", "Vertretung", "Organ", "Geschäftsführung"] },
  { colloquial: "grundkapital", legal: ["Grundkapital", "Aktienkapital", "Stammkapital"] },
  { colloquial: "stammkapital", legal: ["Stammkapital", "Grundkapital", "Gesellschaftsvermögen"] },
  { colloquial: "gesellschaftsrecht", legal: ["Gesellschaftsrecht", "Gesellschaft", "Juristische Person"] },
  // AT Insolvency law (IO)
  { colloquial: "insolvenz", legal: ["Insolvenz", "Insolvenzverfahren", "Konkurs", "Sanierung"] },
  { colloquial: "insolvenzverfahren", legal: ["Insolvenzverfahren", "Konkursverfahren", "Sanierungsverfahren"] },
  { colloquial: "sanierungsplan", legal: ["Sanierungsplan", "Sanierungsverfahren", "Zwangsausgleich", "Schuldner", "Gläubiger"] },
  { colloquial: "konkurs", legal: ["Konkurs", "Insolvenz", "Insolvenzverfahren"] },
  { colloquial: "sanierung", legal: ["Sanierung", "Sanierungsplan", "Sanierungsverfahren"] },
  // AT Commercial law (UGB)
  { colloquial: "unternehmensgesetzbuch", legal: ["Unternehmensgesetzbuch", "UGB", "Unternehmer"] },
  { colloquial: "ugb", legal: ["Unternehmensgesetzbuch", "Unternehmer", "Unternehmen"] },
  { colloquial: "firma", legal: ["Firma", "Unternehmensname", "Firmenbuch", "Handelsregister"] },
  { colloquial: "firmenbuch", legal: ["Firmenbuch", "Firmenregister", "Handelsregister"] },
  { colloquial: "einzelunternehmer", legal: ["Einzelunternehmer", "Einzelunternehmen", "Unternehmer"] },
  { colloquial: "rechnungslegung", legal: ["Rechnungslegung", "Buchführung", "Jahresabschluss", "Rechnungsabschluss"] },
  { colloquial: "buchführung", legal: ["Buchführung", "Rechnungslegung", "Bücher"] },
  { colloquial: "jahresabschluss", legal: ["Jahresabschluss", "Rechnungsabschluss", "Bilanz"] },
  { colloquial: "zurückbehaltungsrecht", legal: ["Zurückbehaltungsrecht", "Zurückbehaltung", "Retentionsrecht"] },
  { colloquial: "zurückbehaltung", legal: ["Zurückbehaltung", "Zurückbehaltungsrecht"] },
  // AT Procedural law (ZPO, AuStrG)
  { colloquial: "zuständigkeit", legal: ["Zuständigkeit", "Gerichtsstand", "sachliche Zuständigkeit", "örtliche Zuständigkeit"] },
  { colloquial: "gerichtsstand", legal: ["Gerichtsstand", "Zuständigkeit", "Gericht"] },
  { colloquial: "klageschrift", legal: ["Klage", "Klagsbegehren", "Klageschrift", "vorbereitender Schriftsatz"] },
  { colloquial: "klage", legal: ["Klage", "Klagsbegehren", "Klageschrift"] },
  { colloquial: "berufung", legal: ["Berufung", "Rechtsmittel", "Berufungsschrift", "Berufungsfrist"] },
  { colloquial: "rekurs", legal: ["Rekurs", "Rechtsmittel", "Rekursfrist", "Beschwerde"] },
  { colloquial: "rechtsmittel", legal: ["Rechtsmittel", "Berufung", "Rekurs", "Revision"] },
  { colloquial: "urteil", legal: ["Urteil", "Erkenntnis", "Entscheidung"] },
  { colloquial: "kosten", legal: ["Kosten", "Prozesskosten", "Kostenersatz", "Barauslagen"] },
  { colloquial: "prozesskosten", legal: ["Prozesskosten", "Kosten", "Kostenersatz"] },
  { colloquial: "außerstreit", legal: ["Außerstreit", "außerstreitiges Verfahren", "AuStrG"] },
  { colloquial: "außerstreitiges", legal: ["außerstreitiges Verfahren", "Außerstreit", "AuStrG"] },
  // AT Tax law (EStG, UStG, BAO)
  { colloquial: "einkommensteuer", legal: ["Einkommensteuer", "Einkommen", "Einkünfte", "EStG"] },
  { colloquial: "einkommen", legal: ["Einkommen", "Einkünfte", "Einkommensteuer"] },
  { colloquial: "einkünfte", legal: ["Einkünfte", "Einkommen", "Einkunftsarten"] },
  { colloquial: "gewerbebetrieb", legal: ["Gewerbebetrieb", "Einkünfte aus Gewerbebetrieb", "Betriebseinnahmen"] },
  { colloquial: "umsatzsteuer", legal: ["Umsatzsteuer", "UStG", "Steuer", "Umsatz"] },
  { colloquial: "bundesabgabenordnung", legal: ["Bundesabgabenordnung", "BAbO", "Abgaben", "BAO"] },
  { colloquial: "bao", legal: ["Bundesabgabenordnung", "BAbO", "Abgabenverfahren"] },
  { colloquial: "abgaben", legal: ["Abgaben", "Abgabenanspruch", "Bundesabgabenordnung"] },
  { colloquial: "verjährung", legal: ["Verjährung", "Ersitzung", "Fristablauf", "Verjährungsfrist"] },
  { colloquial: "verjährungsfrist", legal: ["Verjährungsfrist", "Verjährung", "Frist"] },
  // AT Civil law specifics (ABGB)
  { colloquial: "gewährleistung", legal: ["Gewährleistung", "Gewährspflicht", "Sachgewährleistung", "Verbürgung"] },
  { colloquial: "gewähr", legal: ["Gewährleistung", "Gewährspflicht", "Verbürgung"] },
  { colloquial: "willensübereinstimmung", legal: ["Willensübereinstimmung", "Willenserklärung", "übereinstimmender Wille", "übereinstimmend", "Versprechen", "Vertrag", "Einigung", "Rechtsgeschäft"] },
  { colloquial: "vertragsabschluss", legal: ["Vertrag", "Vertragsabschluss", "Willenserklärung", "Willensübereinstimmung", "Einigung"] },
  { colloquial: "irrtum", legal: ["Irrtum", "Willensmangel", "Anfechtung", "Geschäftsirrtum"] },
  { colloquial: "anfechtbar", legal: ["Anfechtung", "Anfechtbarkeit", "Willensmangel"] },
  { colloquial: "formvorschriften", legal: ["Form", "Formvorschrift", "Formgültigkeit", "Formmangel"] },
  { colloquial: "liegenschaft", legal: ["Liegenschaft", "Grundstück", "Immobilie", "unbewegliche Sache"] },
  { colloquial: "kaufvertrag", legal: ["Kauf", "Kaufvertrag", "Kaufgegenstand", "Übergabe"] },
  { colloquial: "wohnungseigentum", legal: ["Wohnungseigentum", "Wohnung", "Nutzwert", "Wohnungseigentumsgesetz"] },
  // AT Criminal law specifics (StGB)
  { colloquial: "mord", legal: ["Mord", "Totschlag", "Tötung", "vorsätzliche Tötung"] },
  { colloquial: "totschlag", legal: ["Totschlag", "Tötung", "Mord"] },
  { colloquial: "tötung", legal: ["Tötung", "Mord", "Totschlag", "fahrlässige Tötung"] },
  { colloquial: "diebstahl", legal: ["Diebstahl", "Entwendung", "Fremdes Gut", "Gewahrsam"] },
  { colloquial: "schwerer diebstahl", legal: ["schwerer Diebstahl", "Diebstahl", "Einbruch", "Waffen"] },
  { colloquial: "betrug", legal: ["Betrug", "Täuschung", "Vermögensschaden"] },
  { colloquial: "körperverletzung", legal: ["Körperverletzung", "Verletzung", "Gesundheitsschädigung"] },
  { colloquial: "vorsätzlich", legal: ["Vorsatz", "vorsätzlich", "Vorsätzlichkeit"] },
  { colloquial: "fahrlässig", legal: ["Fahrlässigkeit", "fahrlässig", "Sorgfaltspflicht"] },
  // AT General legal terms
  { colloquial: "schuldhaft", legal: ["Verschulden", "schuldhaft", "Verschuldenshaftung"] },
  { colloquial: "verschulden", legal: ["Verschulden", "Verschuldenshaftung", "Schuld"] },
  { colloquial: "schadenersatzanspruch", legal: ["Schadenersatz", "Schadenersatzanspruch", "Ersatzpflicht"] },
  { colloquial: "obsiegt", legal: ["obsiegen", "Obsiegen", "vollständig unterliegend", "Kostentragung", "unterliegen"] },
  { colloquial: "vorbereitenden", legal: ["vorbereitender Schriftsatz", "Schriftsatz", "Klage"] },
  // AT Employment law — Karenz, Mutterschutz, Urlaub (VkgG, MSchG, BUAG)
  { colloquial: "karenz", legal: ["Karenz", "Karenzzeit", "Elternkarenz", "Väter-Karenzgesetz", "VkgG", "Karenzurlaub"] },
  { colloquial: "karenzzeit", legal: ["Karenz", "Karenzzeit", "Elternkarenz", "VkgG", "Karenzurlaub"] },
  { colloquial: "elternkarenz", legal: ["Karenz", "Elternkarenz", "VkgG", "Karenzurlaub"] },
  { colloquial: "mutterschutz", legal: ["Mutterschutz", "Mutterschutzgesetz", "MSchG", "Schutzfrist", "Wochenhilfe", "Schwangerschaft"] },
  { colloquial: "wochenhilfe", legal: ["Wochenhilfe", "Mutterschutz", "MSchG", "Schutzfrist"] },
  { colloquial: "schutzfrist", legal: ["Schutzfrist", "Mutterschutz", "MSchG", "Beschäftigungsverbot"] },
  { colloquial: "urlaubsentgelt", legal: ["Urlaubsentgelt", "Urlaubsgeld", "Urlaub", "BUAG", "Urlaubs- und Abfertigungsgesetz", "Abfertigung"] },
  { colloquial: "urlaubsgeld", legal: ["Urlaubsgeld", "Urlaubsentgelt", "Urlaub", "BUAG"] },
  { colloquial: "urlaub", legal: ["Urlaub", "Urlaubsentgelt", "Urlaubsgeld", "Jahresurlaub", "Erholungsurlaub"] },
  { colloquial: "abfertigung", legal: ["Abfertigung", "Abfertigungsanspruch", "BUAG", "Dienstverhältnis"] },
  { colloquial: "entlassung", legal: ["Entlassung", "ungerechtfertigte Entlassung", "Dienstbeendigung", "ANVG", "ArbVG"] },
  { colloquial: "ungerechtfertigte", legal: ["ungerechtfertigte Entlassung", "Entlassung", "ANVG", "ArbVG", "Dienstbeendigung"] },
  // AT Admin law (AVG, VwGVG)
  { colloquial: "bescheid", legal: ["Bescheid", "Verwaltungsverfahren", "AVG", "Bescheiderlassung", "Verwaltungsakt"] },
  { colloquial: "verwaltungsgericht", legal: ["Verwaltungsgericht", "VwGVG", "Verwaltungsgerichtsbarkeit", "Verwaltungsgerichtshof"] },
  { colloquial: "verwaltungsverfahren", legal: ["Verwaltungsverfahren", "AVG", "Allgemeines Verwaltungsverfahrensgesetz", "Verwaltungsverfahrensgesetz"] },
  { colloquial: "parteienstellung", legal: ["Parteienstellung", "Partei", "Beteiligter", "Verfahrenspartei", "AVG"] },
  { colloquial: "partei", legal: ["Partei", "Parteienstellung", "Beteiligter", "Verfahrenspartei"] },
  { colloquial: "rechtsschutz", legal: ["Rechtsschutz", "Beschwerde", "Rechtsmittel", "VwGVG", "Verwaltungsgericht"] },
  { colloquial: "antrag", legal: ["Antrag", "Antragstellung", "Sachantrag", "Frist", "AVG"] },
  // AT Competition law (KartG)
  { colloquial: "zusammenschlusskontrolle", legal: ["Zusammenschlusskontrolle", "Fusionskontrolle", "Zusammenschluss", "Kartellrecht", "KartG", "Marktbeherrschung"] },
  { colloquial: "zusammenschluss", legal: ["Zusammenschluss", "Zusammenschlusskontrolle", "Fusionskontrolle", "KartG"] },
  { colloquial: "fusionskontrolle", legal: ["Fusionskontrolle", "Zusammenschlusskontrolle", "KartG", "Zusammenschluss"] },
  { colloquial: "kartellrecht", legal: ["Kartellrecht", "Kartellgesetz", "KartG", "Wettbewerbsrecht", "Marktbeherrschung"] },
  { colloquial: "marktbeherrschend", legal: ["Marktbeherrschung", "Marktbeherrschende Stellung", "Missbrauch", "KartG", "Wettbewerbsrecht"] },
  { colloquial: "missbrauch", legal: ["Missbrauch", "Marktbeherrschung", "Marktbeherrschende Stellung", "KartG"] },
  { colloquial: "wettbewerbsrecht", legal: ["Wettbewerbsrecht", "Kartellrecht", "KartG", "Wettbewerb"] },
  // AT Trade law (GewO)
  { colloquial: "gewerbeberechtigung", legal: ["Gewerbeberechtigung", "Gewerbe", "Gewerbeordnung", "GewO", "Gewerbeinhaber"] },
  { colloquial: "gewerbeerteilung", legal: ["Gewerbeerteilung", "Gewerbeberechtigung", "Gewerbe", "GewO", "Befähigungsnachweis"] },
  { colloquial: "gewerbeuntersagung", legal: ["Gewerbeuntersagung", "Gewerbeentzug", "Gewerbe", "GewO", "Untersagung"] },
  { colloquial: "gewerbe", legal: ["Gewerbe", "Gewerbeordnung", "GewO", "Gewerbeberechtigung"] },
  { colloquial: "gewerberecht", legal: ["Gewerberecht", "Gewerbeordnung", "GewO", "Gewerbe"] },
  // AT Data protection law (DSG)
  { colloquial: "datenschutz", legal: ["Datenschutz", "Datenschutzgesetz", "DSG", "personenbezogene Daten", "Datenverarbeitung"] },
  { colloquial: "personenbezogene", legal: ["personenbezogene Daten", "Datenverarbeitung", "DSG", "Datenschutz"] },
  { colloquial: "datenverarbeitung", legal: ["Datenverarbeitung", "Verwendung", "Daten", "DSG", "personenbezogene Daten"] },
  { colloquial: "betroffenenrechte", legal: ["Betroffener", "Auskunftsrecht", "Auskunft", "Richtigstellung", "Löschung", "DSG"] },
  { colloquial: "betroffener", legal: ["Betroffener", "Betroffenenrechte", "Auskunftsrecht", "DSG"] },
  { colloquial: "betroffene", legal: ["Betroffener", "Betroffenenrechte", "Auskunftsrecht", "Auskunft", "DSG"] },
  { colloquial: "auskunftsrecht", legal: ["Auskunftsrecht", "Auskunft", "Betroffener", "DSG"] },
  { colloquial: "verarbeitung", legal: ["Verarbeitung", "Verwendung", "Datenverarbeitung", "DSG", "personenbezogene Daten"] },
  // AT Social law (ASVG)
  { colloquial: "krankenversicherung", legal: ["Krankenversicherung", "Krankenversicherungsschutz", "ASVG", "Leistungen", "Heilbehandlung"] },
  { colloquial: "krankenversicherungsschutz", legal: ["Krankenversicherungsschutz", "Krankenversicherung", "ASVG", "Leistung"] },
  { colloquial: "pensionsanspruch", legal: ["Pensionsanspruch", "Pension", "Pensionsversicherung", "ASVG", "Alterspension", "Pensionsantritt"] },
  { colloquial: "pensionsversicherung", legal: ["Pensionsversicherung", "Pension", "ASVG", "Pensionsanspruch"] },
  { colloquial: "pension", legal: ["Pension", "Pensionsanspruch", "Pensionsversicherung", "ASVG", "Alterspension"] },
  { colloquial: "sozialversicherung", legal: ["Sozialversicherung", "ASVG", "Krankenversicherung", "Pensionsversicherung"] },
  // AT Asylum law (AsylG)
  { colloquial: "asyl", legal: ["Asyl", "Asylwerber", "Asylverfahren", "Asylantrag", "Asylgesetz", "AsylG", "Flüchtling"] },
  { colloquial: "asylwerber", legal: ["Asylwerber", "Asyl", "Asylverfahren", "AsylG", "Flüchtling"] },
  { colloquial: "asylverfahren", legal: ["Asylverfahren", "Asyl", "Asylwerber", "AsylG", "Verfahren"] },
  { colloquial: "asylantrag", legal: ["Asylantrag", "Asyl", "Asylwerber", "AsylG", "Antrag"] },
  // AT Jurisdiction (JN)
  { colloquial: "örtlich zuständig", legal: ["örtliche Zuständigkeit", "Gerichtsstand", "allgemeiner Gerichtsstand", "JN", "Jurisdiktionsnorm"] },
  { colloquial: "wohnitz", legal: ["Wohnsitz", "allgemeiner Gerichtsstand", "Gerichtsstand", "JN"] },
];

/**
 * Expand a user query with legal synonyms. Returns the original query
 * with appended legal terms when colloquial terms are detected.
 *
 * Example:
 *   "Wer haftet bei Hundebiss nach AT Recht?"
 *   → "Wer haftet bei Hundebiss nach AT Recht? Tier Tierhalter Tierhalterhaftung"
 *
 * The expansion is appended (not replaced) so the original semantic
 * meaning is preserved for vector search while keyword search gets
 * the formal legal terms.
 */
export function expandLegalQuery(query: string): string {
  if (!query || query.length < 3) return query;

  const lowerQuery = query.toLowerCase();
  const additions = new Set<string>();

  for (const syn of LEGAL_SYNONYMS) {
    // Word-boundary match to avoid partial matches (e.g. "Hund" in "Hunde")
    // German allows compound words, so we also check for common compound prefixes.
    const pattern = new RegExp(`(?:^|\\s)${escapeRegex(syn.colloquial)}(?:[esn]?[\\s?!.,;:]|$|(?=[A-Z]))`, "i");
    if (pattern.test(lowerQuery)) {
      for (const legal of syn.legal) {
        if (!lowerQuery.includes(legal.toLowerCase())) {
          additions.add(legal);
        }
      }
    }
  }

  if (additions.size === 0) return query;

  // Limit to 12 additions to avoid query bloat
  const terms = Array.from(additions).slice(0, 12);
  return `${query} ${terms.join(" ")}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
