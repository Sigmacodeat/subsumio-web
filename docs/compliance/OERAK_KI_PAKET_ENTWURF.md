# ÖRAK-KI-Paket: Entwurf

Stand 18.09.2026. **Entwurf, nicht unterschreiben und nicht veröffentlichen, bevor die offenen Punkte in Abschnitt 4 erledigt sind.** Jede Antwort unten ist am Code und an der Deploy-Konfiguration geprüft, nicht an der Website.

Grundlage:

- ÖRAK-Leitfaden „Künstliche Intelligenz (KI) in Anwaltskanzleien“, Stand September 2025, mit der „Checkliste für KI-Anbieter“ (AK IT und Digitalisierung)
- § 9 Abs 2 RAO, § 40 Abs 3 RL-BA 2015, Art 28 DSGVO

Warum das zuerst kommt: Laut Leitfaden muss der Anbieter die Checkliste **schriftlich bestätigen, bevor** eine Kanzlei Mandantendaten eingibt. Ohne diese Bestätigung darf sie nur abstrakte, anonyme Fragen stellen. AI:ssociate veröffentlicht die ausgefüllte Checkliste als PDF (Stand 01/2026), MANZ-Noxtua nennt § 40 Abs 3 RL-BA im Launch-Text. Siehe Wettbewerbsanalyse vom 18.09.2026.

---

## 1. Checkliste mit ehrlichem Ist-Stand

Legende: **erfüllt** = heute belegbar. **offen** = heute nicht bestätigbar, Maßnahme in Abschnitt 4.

| #   | Anforderung der ÖRAK-Checkliste                                        | Ist-Stand Subsumio                                                                                                                                                                                                                                                                                                                                     | Status                                                    |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1.1 | Wahrung der Verschwiegenheit (§ 9 Abs 2 RAO), TOMs                     | Mandantentrennung pro Kanzlei (Source-Scoping), Rollen und Rechte, 2FA, Audit-Log mit Hash-Kette, verschlüsselte Secrets, Backups verschlüsselt. Mitarbeiterverpflichtung auf Verschwiegenheit ist nicht dokumentiert.                                                                                                                                 | offen (Verpflichtungserklärung für alle mit Datenzugriff) |
| 1.2 | Bereitschaft zur Vereinbarung nach § 40 Abs 3 RL-BA                    | Muster in Abschnitt 3 dieses Entwurfs                                                                                                                                                                                                                                                                                                                  | erfüllt, sobald das Muster freigegeben ist                |
| 1.3 | Bereitschaft zur AVV nach Art 28 DSGVO                                 | AVV-Text vorhanden (`src/components/legal/legal-content.tsx`, § 1–§ 4). Die Liste der Unterauftragsverarbeiter dort ist unvollständig (siehe Abschnitt 2).                                                                                                                                                                                             | offen (Liste ergänzen)                                    |
| 1.4 | Kein Training mit eingegebenen Daten                                   | Im Code nicht erzwungen: `src/lib/model-provider-policy.ts` wird außerhalb der Tests nicht importiert. OpenRouter kann Anbieter mit Training ausschließen und nur Zero-Data-Retention-Endpunkte (ZDR) nutzen; ob das im Konto eingestellt ist, ist nicht belegt.                                                                                       | offen                                                     |
| 1.5 | Sichere Löschung nach Vertragsende                                     | Vorhanden ist nur der **Export** (`/api/data-export/gdpr`, nur `GET`). Eine Funktion, die alle Daten einer Kanzlei (Engine-Source, Dateien, Nutzer) bei Vertragsende löscht, gibt es weder in der App noch in der Betreiber-Konsole. Backups laufen nach ihrer Aufbewahrungsfrist aus.                                                                 | offen                                                     |
| 2.1 | Server in der EU oder einem Staat mit Angemessenheitsbeschluss         | Hosting: Hetzner, Deutschland. **KI-Aufrufe:** OpenRouter (USA) leitet an Anthropic (USA) weiter; Embeddings `openai/text-embedding-3-small` über OpenRouter (USA). Die USA gelten nur für Firmen mit Zertifizierung unter dem EU-US Data Privacy Framework als angemessen; die Zertifizierung von OpenRouter, Anthropic und OpenAI ist nicht geprüft. | offen                                                     |
| 2.2 | Sub-Dienstleister erfüllen die Anforderungen ebenfalls                 | Liste in Abschnitt 2. Für die KI-Anbieter fehlen schriftliche Zusagen (Trainingsverbot, Löschung, Standort).                                                                                                                                                                                                                                           | offen                                                     |
| 2.3 | Information bei Hausdurchsuchung, auch bei Sub-Dienstleistern          | Ausnahme laut Leitfaden nur, wenn der Sub-Dienstleister **kurzzeitig und automatisiert** verarbeitet. Laut KI-Audit vom 18.09.2026 verlangt Claude Fable 5.1 beim Anbieter **30 Tage Datenaufbewahrung (kein ZDR)**. Für diese Modellstufe greift die Ausnahme daher voraussichtlich nicht.                                                            | offen                                                     |
| 3.1 | TOMs auf Anfrage darlegen                                              | Belegbar: Hosting, Verschlüsselung, Backups mit wöchentlicher Wiederherstellungsprobe, Audit, Rate-Limits, Virenscan bei Uploads. Es gibt kein zusammenhängendes TOM-Dokument.                                                                                                                                                                         | offen (Dokument erstellen)                                |
| 3.2 | Pflicht zur unverzüglichen Meldung, wenn ein Punkt nicht mehr zutrifft | Prozess nicht festgelegt                                                                                                                                                                                                                                                                                                                               | offen                                                     |

**Ergebnis:** Heute ist die Checkliste **nicht wahrheitsgemäß unterschreibbar**. Das deckt sich mit dem KI-Audit (`docs/AUDIT_KI_COPILOT_2026-09-18.md`, P0-1 und A2). Der kürzeste Weg zur Unterschrift steht in Abschnitt 4.

---

## 2. Unterauftragsverarbeiter (aus Code und Deploy-Konfiguration)

Die Datenschutzerklärung nennt heute nur Hetzner, OpenRouter, Stripe und Resend. Im Code sind weitere Dienste angebunden.

| Dienst                             | Zweck                                              | Mandantendaten?                          | Sitz / Verarbeitung              | Aktiv                                           | Beleg im Code                                      |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------- | -------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Hetzner Online GmbH                | Hosting von Web, Engine und Datenbank              | ja, alles                                | DE (Falkenstein)                 | immer                                           | `server/deploy/hetzner/`                           |
| OpenRouter Inc.                    | Gateway zu allen Sprach- und Embedding-Modellen    | ja, Prompts, Akteninhalte, Dokumenttexte | USA                              | immer (`SUBSUMIO_AI_PROVIDER=openrouter`)       | `.env.example:91–102`                              |
| Anthropic PBC (über OpenRouter)    | Sprachmodelle (Claude Sonnet 5, Opus 5, Fable 5.1) | ja                                       | USA                              | immer                                           | `server/src/core/model-config.ts`                  |
| OpenAI (über OpenRouter)           | Embeddings für Suche                               | ja, Textabschnitte                       | USA                              | immer                                           | `SUBSUMIO_EMBEDDING_MODEL`                         |
| Resend                             | Transaktions-E-Mails, Fristerinnerungen            | ja, Betreff und Fristdaten               | USA                              | wenn `RESEND_API_KEY` gesetzt                   | `.env.example:25`                                  |
| Stripe                             | Abrechnung des Abos                                | nein (nur Kanzlei-Stammdaten)            | USA/IE                           | wenn konfiguriert                               | `src/lib/billing/`                                 |
| Upstash                            | Verteilte Ratenbegrenzung                          | nein (IP, Nutzer-ID)                     | Region je Datenbank              | wenn `UPSTASH_REDIS_REST_URL` gesetzt           | `src/lib/auth/rate-limit.ts`                       |
| Sentry                             | Fehlerberichte                                     | möglich (Fehlerkontext)                  | USA oder EU je nach DSN          | wenn `SENTRY_DSN` gesetzt                       | `package.json` `@sentry/nextjs`                    |
| PostHog                            | Produkt-Analyse                                    | nein, nur mit Einwilligung               | Standard `app.posthog.com` (USA) | wenn Schlüssel gesetzt und Einwilligung erteilt | `src/components/providers/monitoring-provider.tsx` |
| Meta Platforms (WhatsApp Business) | Mandantennachrichten über WhatsApp                 | ja                                       | USA/IE                           | wenn die Kanzlei WhatsApp einrichtet            | `src/lib/whatsapp/send.ts`                         |
| DocuSign                           | Elektronische Signatur                             | ja, das zu signierende Dokument          | USA/EU je nach Konto             | wenn die Kanzlei DocuSign einrichtet            | `src/lib/docusign.ts`                              |
| WorkOS                             | Single Sign-on, SCIM                               | nein (Identitätsdaten)                   | USA                              | wenn konfiguriert                               | `src/lib/workos.ts`                                |
| PDF-AS-WEB (Betreiber offen)       | Qualifizierte Signatur mit ID Austria / A-Trust    | ja, das zu signierende PDF               | offen                            | wenn `PDFAS_WEB_URL` gesetzt                    | `src/lib/qes/`                                     |
| Microsoft 365 / Google             | Postfach- und Kalenderanbindung                    | ja                                       | nach Vertrag der Kanzlei         | nur auf Wunsch der Kanzlei                      | `src/lib/email/mail-oauth.ts`                      |

Microsoft 365 und Google sind Dienste **der Kanzlei**; Subsumio greift nur in ihrem Auftrag zu. Sie gehören in die Dienstleisterinformation an den Klienten (§ 40 Abs 3 Z 5 RL-BA), nicht in unsere Unterauftragsverarbeiterliste.

---

## 3. Muster: Zusatzvereinbarung nach § 40 Abs 3 RL-BA

> Entwurf zur anwaltlichen Prüfung. Er ergänzt die AVV nach Art 28 DSGVO und ersetzt sie nicht.

**Zusatzvereinbarung zur Wahrung der anwaltlichen Verschwiegenheit (§ 9 RAO, § 40 Abs 3 RL-BA)**

zwischen der Rechtsanwaltskanzlei [Name, Anschrift] („Kanzlei“) und [Anbieter laut Impressum] („Anbieter“) zum Vertrag über die Nutzung von Subsumio.

1. **Verschwiegenheit.** Der Anbieter nimmt zur Kenntnis, dass alle Daten, die die Kanzlei in Subsumio verarbeitet, der anwaltlichen Verschwiegenheit nach § 9 RAO unterliegen können. Er verpflichtet sich und alle Personen, die für ihn Zugang zu diesen Daten haben können, schriftlich zur Verschwiegenheit, auch über das Vertragsende hinaus. Zugriff auf Inhalte erfolgt nur, soweit er für den Betrieb oder auf ausdrückliche, protokollierte Anfrage der Kanzlei nötig ist (befristeter Support-Zugang).
2. **Hausdurchsuchung und behördlicher Zugriff (Z 3).** Der Anbieter informiert die Kanzlei unverzüglich, wenn bei ihm oder bei einem Unterauftragsverarbeiter eine Hausdurchsuchung, Beschlagnahme oder ein sonstiger behördlicher Zugriff auf Daten der Kanzlei stattfindet oder angekündigt wird, soweit ihm das rechtlich erlaubt ist. Er weist die Behörde auf die anwaltliche Verschwiegenheit und das Umgehungsverbot des § 9 Abs 3 RAO hin und gibt Daten nur nach Maßgabe der Rechtsordnung heraus.
3. **Unterauftragsverarbeiter.** Der Anbieter setzt nur die in Anlage 1 genannten Unterauftragsverarbeiter ein. Er verpflichtet jeden, der Daten nicht nur kurzzeitig und vollautomatisch verarbeitet, vertraglich zu Punkt 2. Änderungen kündigt er mindestens 30 Tage vorher an; die Kanzlei kann widersprechen.
4. **Kein Training, Löschung.** Eingaben und Dokumente der Kanzlei werden weder vom Anbieter noch von einem Unterauftragsverarbeiter zum Training von KI-Modellen verwendet. Bei Anbietern von Sprachmodellen werden sie nicht länger gespeichert, als für die jeweilige Antwort nötig ist; Ausnahmen stehen mit Frist in Anlage 1. Nach Vertragsende löscht der Anbieter alle Daten der Kanzlei binnen [30] Tagen, Sicherungskopien spätestens nach Ablauf ihrer Aufbewahrungsfrist von [x] Tagen.
5. **Standort.** Daten werden in der EU oder in Staaten mit Angemessenheitsbeschluss der EU-Kommission verarbeitet und gespeichert. Bei Unterauftragsverarbeitern in den USA nur, wenn diese unter dem EU-US Data Privacy Framework zertifiziert sind.
6. **Technische und organisatorische Maßnahmen (Z 4).** Der Anbieter hält die in Anlage 2 beschriebenen Maßnahmen nach dem Stand der Technik ein und legt sie auf Anfrage dar.
7. **Information des Klienten (Z 5).** Der Anbieter stellt der Kanzlei eine aktuelle Beschreibung der Kategorien von Dienstleistern und ihrer Leistungen zur Verfügung, die die Kanzlei an ihre Klienten weitergeben kann (Anlage 3).
8. **Änderungsmeldung.** Trifft eine dieser Zusagen nicht mehr zu oder droht das, informiert der Anbieter die Kanzlei unverzüglich.

Anlagen: 1 Unterauftragsverarbeiter (aus Abschnitt 2), 2 TOMs, 3 Klienteninformation.

**Anlage 3, Muster für die Klienteninformation (§ 40 Abs 3 Z 5 RL-BA):**
„Wir nutzen für die Aktenführung, Recherche und Textarbeit die Kanzleisoftware Subsumio. Deren Anbieter setzt folgende Kategorien von Dienstleistern ein: Rechenzentrumsbetrieb in der EU, Anbieter von KI-Sprachmodellen zur Verarbeitung von Texten (ohne Training mit Ihren Daten), E-Mail-Versand für Benachrichtigungen. Alle sind vertraglich zur Vertraulichkeit verpflichtet.“

---

## 4. Offene Punkte bis zur Unterschrift

Reihenfolge nach Wirkung. Die Punkte 1–3 überschneiden sich mit Welle A des KI-Audits (A1, A2) und gehören zur Datenschutz-Entscheidung der Inhaber („zuerst Qualität, Datenschutz folgt“).

1. **KI-Routing festlegen und erzwingen.**
   - Möglichkeit A: OpenRouter nur mit Zero-Data-Retention-Endpunkten und ohne Anbieter, die trainieren (Kontoeinstellung plus Anfrageparameter), dazu schriftliche Bestätigung von OpenRouter.
   - Möglichkeit B: Claude über eine EU-Region (z. B. AWS Bedrock Frankfurt) direkt anbinden, Embeddings über einen EU-Anbieter.
   - In beiden Fällen die Regel in der Engine am Eingang von `complete` und `runThink` durchsetzen, fail-closed.
2. **Modellstufe mit 30 Tagen Aufbewahrung** (Fable 5.1) für Mandantendaten entweder abschalten oder mit einer Hausdurchsuchungsklausel des Anbieters absichern.
3. **Zertifizierung unter dem EU-US Data Privacy Framework prüfen** für OpenRouter, Anthropic, OpenAI, Resend, Sentry, PostHog und WorkOS (dataprivacyframework.gov). Wer nicht zertifiziert ist: ersetzen oder EU-Region wählen. Beispiele: Resend-Region EU, Sentry-EU-DSN, PostHog-Host `eu.i.posthog.com`.
4. **Datenschutzerklärung und AVV ergänzen** um Upstash, Sentry, PostHog, Meta, DocuSign, WorkOS und den PDF-AS-WEB-Betreiber (`src/components/legal/legal-content.tsx`, Abschnitt 7 und AVV § 4).
5. **Kanzlei-Löschung bei Vertragsende bauen**: Betreiber-Aktion, die Engine-Source, Dateien, Nutzer und Abrechnungsdaten (außer gesetzlich aufzubewahrende Rechnungen) löscht und ein Löschprotokoll erzeugt.
6. **Verschwiegenheitserklärung** für alle Personen mit Server- oder Support-Zugang.
7. **TOM-Dokument** (Anlage 2) aus dem Vorhandenen zusammenstellen: Hosting, Verschlüsselung, Backups mit Wiederherstellungsprobe, Audit-Kette, Support-Zugang nur befristet und protokolliert, Virenscan, Rate-Limits, 2FA.
8. **Anbieter festlegen.** Das Impressum nennt einen Verein; die rechtliche Einheit für Kanzleiverträge ist laut Launch-Megaplan noch offen.
9. **Anwaltliche Prüfung** von Checkliste, Zusatzvereinbarung und AVV. Danach als PDF veröffentlichen, wie AI:ssociate es tut, und beim ÖRAK-Vorteilsprogramm einreichen.
