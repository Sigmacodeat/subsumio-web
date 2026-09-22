// German market overrides for the security page (/de/security).

import { deepMerge } from "./site";
import { SECURITY } from "./security";

export const SECURITY_DE = deepMerge(SECURITY, {
  metaTitle: "Subsumio Sicherheit — Datenschutz für Kanzleien in Deutschland",
  metaDesc:
    "EU-Cloud mit AVV oder On-Premise im Enterprise-Tarif. Kein Training mit Mandantendaten, Zugriffsrechte pro Nutzer und Akte, automatisiert getestet.",
  sub: "Subsumio ist für einen Beruf gebaut, in dem Verschwiegenheit Gesetz ist: Rechtsanwältinnen und Rechtsanwälte in Deutschland. Hier steht, wie das System aufgebaut ist — das ist heute verfügbar.",
  complianceItems: SECURITY.complianceItems.map((item) =>
    item.title.includes("RAO")
      ? {
          title: "Berufsgeheimnis (§ 43a Abs. 2 BRAO, § 203 StGB)",
          desc: "Die Verschwiegenheitspflicht nach § 43a Abs. 2 BRAO trifft Sie — auch dann, wenn Sie Dienstleister einsetzen; ihre Verletzung ist nach § 203 StGB strafbewehrt. In den gehosteten Tarifen ergänzen wir den AVV deshalb um eine vertragliche Verschwiegenheitsverpflichtung. On-Premise mit eigenem Sprachmodell ist kein Dienstleister beteiligt.",
        }
      : item
  ),
});
