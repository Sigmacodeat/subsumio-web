// German market overrides for the legal vertical (/de).
// Genuine German-law copy: § 43a BRAO replaces § 9/§ 10 RAO, BGB §§ 187 ff.
// replace ABGB § 902, gesetze-im-internet.de/openlegaldata replace the RIS,
// RVG replaces the Austrian tariff statutes.

import { deepMerge } from "./site";
import { VERTICALS } from "./verticals";

const legal = VERTICALS.legal;

const legalDe = deepMerge(legal, {
  metaTitle: "Subsumio — Kanzleisoftware Deutschland",
  metaDesc:
    "KI-Kanzleisoftware für Anwälte in Deutschland: Akten, Fristen nach ZPO und BGB, KI-Analysen mit seitengenauen Fundstellen. EU-Hosting mit AVV.",
  badge: "Kanzleisoftware für Deutschland",
  sub: "Subsumio ist Kanzleisoftware für Deutschland: Akten verwalten, Fristen nach ZPO und BGB berechnen, KI-Analysen mit seitengenauen Fundstellen erhalten — in der EU-Cloud mit AVV oder On-Premise (Enterprise).",
  features: [
    {
      icon: "CalendarClock",
      title: "Fristenkontrolle nach ZPO und BGB",
      desc: "Berechnet Berufungs-, Beschwerde- und Revisionsfristen nach §§ 222, 517, 520, 548 ZPO und Fristen nach §§ 187 ff. BGB — samt Verschiebung bei Samstag, Sonntag und Feiertag Ihres Bundeslands und mit Angabe der Norm. Überfällige und kritische Fristen kommen täglich per E-Mail.",
    },
    legal.features[1],
    legal.features[2],
    legal.features[3],
    {
      icon: "ShieldAlert",
      title: "Kollisionsprüfung (§ 43a Abs. 4 BRAO)",
      desc: "Prüft jeden neuen Mandanten oder Gegner serverseitig gegen den gesamten Aktenbestand und meldet Interessenkonflikte, bevor das Mandat angenommen wird. Unterstützt Ihre Prüfung nach § 43a Abs. 4 BRAO i.V.m. § 3 BORA.",
    },
    legal.features[5],
    {
      icon: "Landmark",
      title: "Judikatur deutscher Gerichte",
      desc: "Recherche in deutscher Rechtsprechung (BGH, BVerfG, Oberlandesgerichte via openlegaldata) — relevante Entscheidungen übernehmen Sie mit einem Klick zitierfähig in die Akte.",
    },
    legal.features[7],
    legal.features[8],
    legal.features[9],
    legal.features[10],
    legal.features[11],
  ],
  faq: [
    legal.faq[0],
    legal.faq[1],
    legal.faq[2],
    {
      q: "Was ist mit DSGVO und Berufsrecht?",
      a: "Gehostete Tarife kommen mit EU-Hosting und AVV nach Art. 28 DSGVO; die Auftragsverarbeiter sind dort benannt, ergänzt um eine Verschwiegenheitsverpflichtung im Sinn des § 43a Abs. 2 BRAO und § 203 StGB. On-Premise (Enterprise) bleiben die Daten in Ihrem Netzwerk. Ihr Datenschutzbeauftragter kann gern direkt mit uns sprechen.",
    },
  ],
});

export const VERTICALS_DE = { ...VERTICALS, legal: legalDe };
