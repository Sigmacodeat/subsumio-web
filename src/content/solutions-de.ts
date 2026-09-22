// German market overrides for the /solutions pages (/de/solutions/*).

import { deepMerge } from "./site";
import { SOLUTIONS } from "./solutions";

const lawFirms = SOLUTIONS["law-firms"];
const solo = SOLUTIONS["solo"];
const inHouse = SOLUTIONS["in-house"];

const lawFirmsDe = deepMerge(lawFirms, {
  metaDesc:
    "Gemeinsames Kanzleiwissen, Fristenkontrolle nach ZPO und BGB, KI-Analysen mit Fundstellen, Kollisionsprüfung, Assistent auf WhatsApp — EU-Hosting mit AVV.",
  features: lawFirms.features.map((f) =>
    f.title.includes("Fristenkontrolle")
      ? {
          title: "Fristenkontrolle nach ZPO und BGB",
          desc: "Berufungs-, Beschwerde- und Revisionsfristen nach §§ 517, 520, 548 ZPO, Fristberechnung nach §§ 187 ff. BGB — samt Verschiebung bei Samstag, Sonntag und Feiertag Ihres Bundeslands und mit Angabe der Norm.",
        }
      : f.title.includes("Kollisionsprüfung")
        ? {
            title: "Kollisionsprüfung (§ 43a Abs. 4 BRAO)",
            desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft, bevor das Mandat angenommen wird. Unterstützt Ihre Prüfung nach § 43a Abs. 4 BRAO i.V.m. § 3 BORA.",
          }
        : f
  ),
  faq: lawFirms.faq.map((f) =>
    f.q.includes("Berufsrecht")
      ? {
          q: f.q,
          a: "Gehostete Tarife kommen mit EU-Hosting und AVV nach Art. 28 DSGVO; die Auftragsverarbeiter sind dort benannt, ergänzt um eine Verschwiegenheitsverpflichtung im Sinn des § 43a Abs. 2 BRAO und § 203 StGB. On-Premise (Enterprise) bleiben die Daten in Ihrem Netzwerk.",
        }
      : f
  ),
});

const soloDe = deepMerge(solo, {
  metaDesc:
    "KI-Kanzleisoftware für Einzelkanzleien: Kanzleiwissen, Fristenkontrolle nach ZPO und BGB, KI-Antworten mit Fundstellen, Assistent auf WhatsApp. EU-Hosting, keine eigene IT.",
  features: solo.features.map((f) =>
    f.title.includes("Fristenkontrolle")
      ? {
          title: "Fristenkontrolle nach ZPO und BGB",
          desc: "Berufungs-, Beschwerde- und Revisionsfristen nach §§ 517, 520, 548 ZPO, Fristberechnung nach §§ 187 ff. BGB — samt Verschiebung bei Samstag, Sonntag und Feiertag Ihres Bundeslands und mit Angabe der Norm.",
        }
      : f.title.includes("Kollisionsprüfung")
        ? {
            title: "Kollisionsprüfung (§ 43a Abs. 4 BRAO)",
            desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft, bevor das Mandat angenommen wird. Unterstützt Ihre Prüfung nach § 43a Abs. 4 BRAO i.V.m. § 3 BORA.",
          }
        : f
  ),
  faq: solo.faq.map((f) =>
    f.q.includes("Berufsrecht")
      ? {
          q: f.q,
          a: "Gehostete Tarife kommen mit EU-Hosting und AVV nach Art. 28 DSGVO; die Auftragsverarbeiter sind dort benannt, ergänzt um eine Verschwiegenheitsverpflichtung im Sinn des § 43a Abs. 2 BRAO und § 203 StGB. On-Premise (Enterprise) bleiben die Daten in Ihrem Netzwerk.",
        }
      : f
  ),
});

const inHouseDe = deepMerge(inHouse, {
  metaDesc: inHouse.metaDesc
    .replace("ZPO und ABGB", "ZPO und BGB")
    .replace("österreichischem Recht", "deutschem Recht"),
});

export const SOLUTIONS_DE = {
  "law-firms": lawFirmsDe,
  solo: soloDe,
  "in-house": inHouseDe,
};
