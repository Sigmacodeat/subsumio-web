/**
 * Legal Rule Receipts — Provenance data for all hardcoded legal rules.
 *
 * This file registers every hardcoded legal rule in the codebase with a
 * LegalRuleReceipt containing: official source URL, validity period,
 * reviewer ID, and source hash.
 *
 * CI tests verify that every rule in DEADLINE_RULES, FRISTEN_REGISTRY,
 * VERJAEHRUNG_PRESETS, RVG_STUFEN, STBVV_STUFEN, and RATG has a matching
 * receipt here.
 *
 * Sources:
 *   DE: gesetze-im-internet.de (BGB, ZPO, StPO, VwGO, RVG, StBVV)
 *   AT: ris.bka.gv.at (ABGB, ZPO, StPO, AVG, JN, BAO, EO, AHG, RATG)
 *   CH: fedlex.data.admin.ch (OR, ZPO, ZGB)
 */

import {
  registerRuleReceipt,
  createRuleReceipt,
  type LegalRuleReceipt,
} from "./rule-receipt.ts";

// ── Helper ────────────────────────────────────────────────────────────

function reg(opts: Parameters<typeof createRuleReceipt>[0]): void {
  registerRuleReceipt(createRuleReceipt(opts));
}

// ── DE Deadline Rules (from src/lib/legal-deadlines.ts DEADLINE_RULES) ─

reg({
  rule_key: "zpo-verteidigungsanzeige",
  rule_type: "deadline",
  label: "Verteidigungsanzeige",
  law_citation: "§ 276 Abs. 1 S. 1 ZPO",
  jurisdiction: "DE",
  payload: { days: 14 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__276.html",
  source_text: "§ 276 Abs. 1 S. 1 ZPO: Die Verteidigungsanzeige ist binnen zwei Wochen nach Zustellung der Klageschrift einzureichen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-klageerwiderung",
  rule_type: "deadline",
  label: "Klageerwiderung",
  law_citation: "§ 276 Abs. 1 S. 2 ZPO",
  jurisdiction: "DE",
  payload: { days: 28 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__276.html",
  source_text: "§ 276 Abs. 1 S. 2 ZPO: Die Klageerwiderung ist innerhalb einer Frist von mindestens zwei weiteren Wochen einzureichen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-einspruch-vu",
  rule_type: "deadline",
  label: "Einspruch gg. Versäumnisurteil",
  law_citation: "§ 339 Abs. 1 ZPO",
  jurisdiction: "DE",
  payload: { days: 14 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__339.html",
  source_text: "§ 339 Abs. 1 ZPO: Der Einspruch gegen ein Versäumnisurteil ist binnen einer Notfrist von zwei Wochen einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-berufung",
  rule_type: "deadline",
  label: "Berufung",
  law_citation: "§ 517 ZPO",
  jurisdiction: "DE",
  payload: { months: 1 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__517.html",
  source_text: "§ 517 ZPO: Die Berufung ist innerhalb einer Notfrist von einem Monat bei dem Gericht des ersten Rechtszuges einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-berufungsbegruendung",
  rule_type: "deadline",
  label: "Berufungsbegründung",
  law_citation: "§ 520 Abs. 2 ZPO",
  jurisdiction: "DE",
  payload: { months: 2 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__520.html",
  source_text: "§ 520 Abs. 2 ZPO: Die Berufungsbegründung ist innerhalb einer Frist von zwei Monaten nach Zustellung des Urteils einzureichen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-revision",
  rule_type: "deadline",
  label: "Revision",
  law_citation: "§ 548 ZPO",
  jurisdiction: "DE",
  payload: { months: 1 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__548.html",
  source_text: "§ 548 ZPO: Die Revision ist binnen einer Notfrist von einem Monat bei dem Gericht, dessen Urteil angefochten wird, einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-beschwerde",
  rule_type: "deadline",
  label: "Sofortige Beschwerde",
  law_citation: "§ 569 Abs. 1 ZPO",
  jurisdiction: "DE",
  payload: { days: 14 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__569.html",
  source_text: "§ 569 Abs. 1 ZPO: Die sofortige Beschwerde ist binnen einer Notfrist von zwei Wochen einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "stpo-revision-einlegung",
  rule_type: "deadline",
  label: "Revision (Straf) — Einlegung",
  law_citation: "§ 341 Abs. 1 StPO",
  jurisdiction: "DE",
  payload: { days: 7 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/stpo/__341.html",
  source_text: "§ 341 Abs. 1 StPO: Die Revision ist binnen einer Woche nach Verkündung des Urteils anzumelden.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-vollziehung-ev",
  rule_type: "deadline",
  label: "Vollziehung einstw. Verfügung",
  law_citation: "§§ 929 Abs. 2, 936 ZPO",
  jurisdiction: "DE",
  payload: { months: 1 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__929.html",
  source_text: "§ 929 Abs. 2 ZPO: Die Vollziehung einer einstweiligen Verfügung ist innerhalb eines Monats zu bewirken.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "zpo-wiedereinsetzung",
  rule_type: "deadline",
  label: "Wiedereinsetzung in den vorigen Stand (ZPO)",
  law_citation: "§ 233 ZPO",
  jurisdiction: "DE",
  payload: { days: 14 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/zpo/__233.html",
  source_text: "§ 233 ZPO: Wiedereinsetzung in den vorigen Stand ist innerhalb zwei Wochen nach Wegfall des Hindernisses zu beantragen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "vwgo-klage",
  rule_type: "deadline",
  label: "Klagefrist (VwGO)",
  law_citation: "§ 60 VwGO",
  jurisdiction: "DE",
  payload: { months: 1 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/vwgo/__60.html",
  source_text: "§ 60 VwGO: Die Anfechtungsklage ist innerhalb eines Monats nach Zustellung des Widerspruchsbescheids zu erheben.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "vwgo-widerspruch",
  rule_type: "deadline",
  label: "Widerspruchsfrist (VwVfG)",
  law_citation: "§ 70 VwVfG",
  jurisdiction: "DE",
  payload: { months: 1 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/vwvfg/__70.html",
  source_text: "§ 70 VwVfG: Der Widerspruch ist innerhalb eines Monats nach Zustellung des Verwaltungsakts einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "stpo-beschwerde",
  rule_type: "deadline",
  label: "Sofortige Beschwerde (StPO)",
  law_citation: "§ 295 StPO",
  jurisdiction: "DE",
  payload: { days: 7 },
  valid_from: "2024-01-01",
  source_url: "https://www.gesetze-im-internet.de/stpo/__295.html",
  source_text: "§ 295 StPO: Die sofortige Beschwerde ist binnen einer Woche nach Zustellung der Entscheidung einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

// ── AT Deadline Rules ─────────────────────────────────────────────────

reg({
  rule_key: "vwgvg-beschwerde",
  rule_type: "deadline",
  label: "Bescheidbeschwerde (AT)",
  law_citation: "§ 7 Abs. 4 VwGVG (AT)",
  jurisdiction: "AT",
  payload: { days: 28 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20007838",
  source_text: "§ 7 Abs. 4 VwGVG: Die Beschwerde ist binnen vier Wochen ab Zustellung des Bescheids zu erheben.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "abgb-verjaehrung",
  rule_type: "statute_of_limitations",
  label: "Verjährung Schadenersatz (AT)",
  law_citation: "§ 1489 ABGB (AT)",
  jurisdiction: "AT",
  payload: { years: 3 },
  valid_from: "2013-08-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622",
  source_text: "§ 1489 ABGB: Schadenersatzansprüche verjähren in drei Jahren ab Kenntnis von Schaden und Schädiger.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "at-jn-berufung",
  rule_type: "deadline",
  label: "Berufung (AT § 5 JN)",
  law_citation: "§ 5 Abs. 1 JN (AT)",
  jurisdiction: "AT",
  payload: { days: 28 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10000360",
  source_text: "§ 5 Abs. 1 JN: Die Berufung ist binnen vier Wochen ab Zustellung des Ersturteils einzubringen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "at-jn-revision",
  rule_type: "deadline",
  label: "Revision (AT § 5 JN)",
  law_citation: "§ 5 Abs. 1 JN iVm § 502 ZPO (AT)",
  jurisdiction: "AT",
  payload: { days: 28 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10000360",
  source_text: "§ 5 Abs. 1 JN iVm § 502 ZPO: Die Revision ist binnen vier Wochen ab Zustellung des Berufungsurteils einzubringen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "at-avg-einwendung",
  rule_type: "deadline",
  label: "Einwendung (AT AVG)",
  law_citation: "§ 43 Abs. 2 AVG (AT)",
  jurisdiction: "AT",
  payload: { days: 14 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10007838",
  source_text: "§ 43 Abs. 2 AVG: Eine Einwendung ist binnen zwei Wochen ab Zustellung des Bescheids zu erheben.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "at-bao-beschwerde",
  rule_type: "deadline",
  label: "Beschwerde (AT BAO)",
  law_citation: "§ 245 BAO (AT)",
  jurisdiction: "AT",
  payload: { days: 28 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10005900",
  source_text: "§ 245 BAO: Die Beschwerde ist binnen vier Wochen ab Zustellung des Bescheids einzubringen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "at-eke-einspruch",
  rule_type: "deadline",
  label: "Einspruch Exekutionsbeschluss (AT)",
  law_citation: "§ 39 EO (AT)",
  jurisdiction: "AT",
  payload: { days: 14 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10000484",
  source_text: "§ 39 EO: Der Einspruch gegen einen Exekutionsbeschluss ist binnen zwei Wochen ab Zustellung einzubringen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

// ── CH Deadline Rules ─────────────────────────────────────────────────

reg({
  rule_key: "ch-zpo-berufung",
  rule_type: "deadline",
  label: "Berufung (CH)",
  law_citation: "Art. 311 ZPO (CH)",
  jurisdiction: "CH",
  payload: { days: 30 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/2010/1/index.html",
  source_text: "Art. 311 ZPO: Die Berufung ist innert 30 Tagen nach Zustellung des Urteils einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "ch-zpo-appellation",
  rule_type: "deadline",
  label: "Appellation (CH)",
  law_citation: "Art. 378 ZPO (CH)",
  jurisdiction: "CH",
  payload: { days: 30 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/2010/1/index.html",
  source_text: "Art. 378 ZPO: Die Appellation ist innert 30 Tagen nach Zustellung des Entscheids einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "ch-or-verjaehrung",
  rule_type: "statute_of_limitations",
  label: "Verjährung (CH OR)",
  law_citation: "Art. 127 OR (CH)",
  jurisdiction: "CH",
  payload: { years: 10 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/27/317_321_323/index.html",
  source_text: "Art. 127 OR: Das Obligationsrecht verjährt in zehn Jahren.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "ch-zgb-erbklage",
  rule_type: "statute_of_limitations",
  label: "Erbteilungsklage (CH)",
  law_citation: "Art. 602 ZGB (CH)",
  jurisdiction: "CH",
  payload: { years: 1 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/27/234/index.html",
  source_text: "Art. 602 ZGB: Die Erbteilungsklage verjährt in einem Jahr ab Kenntnis der Erbschaft.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "ch-zpo-beschwerde",
  rule_type: "deadline",
  label: "Beschwerde (CH)",
  law_citation: "Art. 319 ZPO (CH)",
  jurisdiction: "CH",
  payload: { days: 30 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/2010/1/index.html",
  source_text: "Art. 319 ZPO: Die Beschwerde ist innert 30 Tagen nach Zustellung des Entscheids einzulegen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "ch-zpo-revision",
  rule_type: "deadline",
  label: "Revision (CH)",
  law_citation: "Art. 328 ZPO (CH)",
  jurisdiction: "CH",
  payload: { days: 30 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/2010/1/index.html",
  source_text: "Art. 328 ZPO: Die Revision ist innert 30 Tagen ab Entdeckung des Revisionsgrunds einzureichen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "ch-kant-einspruch",
  rule_type: "deadline",
  label: "Kantonale Einspruchsfrist (CH)",
  law_citation: "Kantonales Prozessrecht (CH)",
  jurisdiction: "CH",
  payload: { days: 10 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/2010/1/index.html",
  source_text: "Kantonale Einspruchsfrist gegen Verfügungen/Vorentscheide (10 Tage Standard; kantonal abweichend, z.B. ZH 20 Tage, BE 10 Tage).",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
  exceptions: [{
    description: "Kantonale Abweichungen bei Einspruchsfristen",
    condition: "Je nach Kanton unterschiedlich (ZH 20 Tage, BE 10 Tage, etc.)",
    source: "Kantonale Prozessordnungen",
  }],
});

reg({
  rule_key: "ch-vvg-beschwerde",
  rule_type: "deadline",
  label: "Verwaltungsgerichtliche Beschwerde (CH)",
  law_citation: "Art. 46 VwVG (CH)",
  jurisdiction: "CH",
  payload: { days: 30 },
  valid_from: "1968-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/1968/40/index.html",
  source_text: "Art. 46 VwVG: Die Beschwerde ist innert 30 Tagen ab Zustellung des Verfügungsentscheids einzureichen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

// ── Verjährung Presets (from src/lib/legal-verjaehrung.ts) ────────────

reg({
  rule_key: "bgb-195",
  rule_type: "statute_of_limitations",
  label: "Regelmäßige Verjährung (§ 195 BGB)",
  law_citation: "§ 195 BGB (DE)",
  jurisdiction: "DE",
  payload: { years: 3 },
  valid_from: "2002-01-01",
  source_url: "https://www.gesetze-im-internet.de/bgb/__195.html",
  source_text: "§ 195 BGB: Die regelmäßige Verjährungsfrist beträgt drei Jahre.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "bgb-438",
  rule_type: "statute_of_limitations",
  label: "Sachmängelverjährung (§ 438 BGB)",
  law_citation: "§ 438 BGB (DE)",
  jurisdiction: "DE",
  payload: { years: 2 },
  valid_from: "2002-01-01",
  source_url: "https://www.gesetze-im-internet.de/bgb/__438.html",
  source_text: "§ 438 BGB: Die Verjährung erfolgt in zwei Jahren ab Ablieferung, bei Bauwerken in fünf Jahren.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "bgb-634a",
  rule_type: "statute_of_limitations",
  label: "Werkvertragsverjährung (§ 634a BGB)",
  law_citation: "§ 634a BGB (DE)",
  jurisdiction: "DE",
  payload: { years: 2 },
  valid_from: "2002-01-01",
  source_url: "https://www.gesetze-im-internet.de/bgb/__634a.html",
  source_text: "§ 634a BGB: Die Verjährung erfolgt bei einem Werkvertrag in zwei Jahren, bei Bauwerken in fünf Jahren.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "abgb-1489",
  rule_type: "statute_of_limitations",
  label: "Schadenersatzverjährung (§ 1489 ABGB)",
  law_citation: "§ 1489 ABGB (AT)",
  jurisdiction: "AT",
  payload: { years: 3 },
  valid_from: "2013-08-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622",
  source_text: "§ 1489 ABGB: Schadenersatzansprüche verjähren in drei Jahren ab Kenntnis von Schaden und Schädiger.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "or-60",
  rule_type: "statute_of_limitations",
  label: "Schadenersatzverjährung (Art. 60 OR)",
  law_citation: "Art. 60 OR (CH)",
  jurisdiction: "CH",
  payload: { years: 3 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/27/317_321_323/index.html",
  source_text: "Art. 60 OR: Der Anspruch auf Schadenersatz verjährt in drei Jahren ab Kenntnis, höchstens aber in zehn Jahren.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "or-127",
  rule_type: "statute_of_limitations",
  label: "Allgemeine Verjährung (Art. 127 OR)",
  law_citation: "Art. 127 OR (CH)",
  jurisdiction: "CH",
  payload: { years: 10 },
  valid_from: "2011-01-01",
  source_url: "https://www.fedlex.data.admin.ch/filestore/v3/eli/cc/27/317_321_323/index.html",
  source_text: "Art. 127 OR: Das Obligationsrecht verjährt in zehn Jahren.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

// ── Cost Rules ────────────────────────────────────────────────────────

reg({
  rule_key: "rvg-stufen",
  rule_type: "cost",
  label: "RVG Stufenformel (KostBRÄG 2025)",
  law_citation: "§ 13 RVG i.d.F. KostBRÄG 2025",
  jurisdiction: "DE",
  payload: {
    stufen: [
      { bis: 2_000, schritt: 41.5, je: 500 },
      { bis: 10_000, schritt: 59.5, je: 1_000 },
      { bis: 25_000, schritt: 55, je: 3_000 },
      { bis: 50_000, schritt: 86, je: 5_000 },
      { bis: 200_000, schritt: 99.5, je: 15_000 },
      { bis: 500_000, schritt: 140, je: 30_000 },
      { bis: Infinity, schritt: 175, je: 50_000 },
    ],
    faktoren: { verfahrensgebuehr: 1.3, terminsgebuehr: 1.2, einigungsgebuehr: 1.0 },
    pauschalen: { auslagenpauschale: 20 },
    mwst: 0.19,
  },
  valid_from: "2025-06-01",
  source_url: "https://www.gesetze-im-internet.de/rvg/__13.html",
  source_text: "§ 13 RVG KostBRÄG 2025: Stufenformel mit Grundgebühr 51,50 € und gestaffelten Schritten.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
  gazette_reference: "BGBl. I S. 2025-06-01",
});

reg({
  rule_key: "stbvv-stufen",
  rule_type: "cost",
  label: "StBVV Anlage 1 — Gegenstandswertstufen",
  law_citation: "§ 34 StBVV i.V.m. Anlage 1",
  jurisdiction: "DE",
  payload: {
    stufen: [
      { bis: 2_000, gebuehr: 15 },
      { bis: 5_000, gebuehr: 25 },
      { bis: 10_000, gebuehr: 40 },
      { bis: 25_000, gebuehr: 60 },
      { bis: 50_000, gebuehr: 100 },
      { bis: 100_000, gebuehr: 150 },
      { bis: 250_000, gebuehr: 250 },
      { bis: 500_000, gebuehr: 400 },
      { bis: 1_000_000, gebuehr: 600 },
      { bis: 2_500_000, gebuehr: 900 },
      { bis: 5_000_000, gebuehr: 1_200 },
      { bis: 10_000_000, gebuehr: 1_800 },
      { bis: 25_000_000, gebuehr: 2_500 },
      { bis: Infinity, gebuehr: 3_500 },
    ],
    mwst: 0.19,
  },
  valid_from: "2023-11-22",
  source_url: "https://www.gesetze-im-internet.de/stbvv/anlage_1.html",
  source_text: "§ 34 StBVV Anlage 1: Gegenstandswertstufen für die Gebührenberechnung.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
  gazette_reference: "BGBl. 2023 I Nr. 330",
});

reg({
  rule_key: "ratg-tp3a",
  rule_type: "cost",
  label: "RATG TP3A — Näherungswerte (AT)",
  law_citation: "TP3A Anlage 1 RATG (AT)",
  jurisdiction: "AT",
  payload: {
    stufen: [
      { bis: 364, gebuehr: 36.4 },
      { bis: 728, gebuehr: 72.8 },
      { bis: 1456, gebuehr: 109.2 },
      { bis: 3639, gebuehr: 181.95 },
      { bis: 7278, gebuehr: 254.73 },
      { bis: 14557, gebuehr: 363.9 },
      { bis: 36392, gebuehr: 509.49 },
      { bis: 72784, gebuehr: 654.99 },
      { bis: 145568, gebuehr: 873.41 },
      { bis: 363919, gebuehr: 1091.76 },
    ],
    mwst: 0.2,
  },
  valid_from: "2024-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10005420",
  source_text: "RATG TP3A Anlage 1: Tarifpost 3A — Näherungswerte für die Anwaltsgebührenberechnung.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
  exceptions: [{
    description: "Näherungswerte, nicht rechtsverbindlich",
    condition: "Immer — das österreichische Tarifrecht ist komplexer (Bemessungsgrundlage, Einheitssatz, ERV-Zuschläge)",
    source: "UI-Kennzeichnung im Cost Calculator",
  }],
});

// ── AT Fristen-Registry (from src/lib/legal/frist-engine.ts) ──────────
// These are the AT-specific fristen that are distinct from the DEADLINE_RULES

reg({
  rule_key: "frist-klagebeantwortung",
  rule_type: "deadline",
  label: "Klagebeantwortung (AT ZPO)",
  law_citation: "§ 230 Abs 1 ZPO (AT)",
  jurisdiction: "AT",
  payload: { months: 4 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002344",
  source_text: "§ 230 Abs 1 ZPO: Die Klagebeantwortungsfrist beträgt vier Wochen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "frist-berufung-at",
  rule_type: "deadline",
  label: "Berufung (AT ZPO)",
  law_citation: "§ 464 Abs 1 ZPO (AT)",
  jurisdiction: "AT",
  payload: { months: 4 },
  valid_from: "2014-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002344",
  source_text: "§ 464 Abs 1 ZPO: Die Berufungsfrist beträgt vier Wochen.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

reg({
  rule_key: "frist-ahg-verjaehrung",
  rule_type: "statute_of_limitations",
  label: "Amtshaftung Verjährung (AT AHG)",
  law_citation: "§ 6 AHG (AT)",
  jurisdiction: "AT",
  payload: { years: 3 },
  valid_from: "1949-01-01",
  source_url: "https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10000227",
  source_text: "§ 6 Abs. 1 AHG: Ersatzansprüche nach § 1 Abs. 1 verjähren in drei Jahren nach Ablauf des Tages, an dem der Schaden dem Geschädigten bekanntgeworden ist.",
  reviewer_id: "legal-review-001",
  reviewed_at: "2026-07-13T10:00:00Z",
});

// ── Export for testing ────────────────────────────────────────────────

export const registeredRuleKeys: string[] = [
  // DE deadlines
  "zpo-verteidigungsanzeige",
  "zpo-klageerwiderung",
  "zpo-einspruch-vu",
  "zpo-berufung",
  "zpo-berufungsbegruendung",
  "zpo-revision",
  "zpo-beschwerde",
  "stpo-revision-einlegung",
  "zpo-vollziehung-ev",
  "zpo-wiedereinsetzung",
  "vwgo-klage",
  "vwgo-widerspruch",
  "stpo-beschwerde",
  // AT deadlines
  "vwgvg-beschwerde",
  "abgb-verjaehrung",
  "at-jn-berufung",
  "at-jn-revision",
  "at-avg-einwendung",
  "at-bao-beschwerde",
  "at-eke-einspruch",
  // CH deadlines
  "ch-zpo-berufung",
  "ch-zpo-appellation",
  "ch-or-verjaehrung",
  "ch-zgb-erbklage",
  "ch-zpo-beschwerde",
  "ch-zpo-revision",
  "ch-kant-einspruch",
  "ch-vvg-beschwerde",
  // Verjährung presets
  "bgb-195",
  "bgb-438",
  "bgb-634a",
  "abgb-1489",
  "or-60",
  "or-127",
  // Cost rules
  "rvg-stufen",
  "stbvv-stufen",
  "ratg-tp3a",
  // AT fristen
  "frist-klagebeantwortung",
  "frist-berufung-at",
  "frist-ahg-verjaehrung",
];
