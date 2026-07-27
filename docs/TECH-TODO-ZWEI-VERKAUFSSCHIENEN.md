# Zwei Verkaufsschienen: Technik- und Rolloutplan

Stand: 18. Juli 2026

## Zielbild

Subsumio verkauft über zwei klar getrennte Einstiege:

1. **Privatpersonen**: begrenzte, automatisierte rechtliche Orientierung zu einer definierten Frage. Keine Kanzlei-, Team- oder Abrechnungsfunktionen und kein Ersatz für individuelle Rechtsberatung.
2. **Kanzleien & Rechtsabteilungen**: professionelle Aktenarbeit in den Stufen Solo, Kanzlei und Enterprise.

Die Trennung ist eine Produktgrenze, nicht nur eine Marketingauswahl. Zielgruppe, Funktionen, Limits, Preis, Checkout und Claims müssen dieselbe Grenze abbilden.

## Umgesetzter Stand

- [x] Kanonisches Zielgruppen- und Angebotsmodell in `src/content/audiences.ts`
- [x] Einstiegskarten auf der Startseite
- [x] Umschaltbare Preisübersicht Privat / Professionell
- [x] Eigene Zielseiten `/privat` und `/kanzlei`
- [x] Lokalisierte Routen für alle derzeit unterstützten Sprachpräfixe
- [x] Solo/Kanzlei-Mapping auf bestehende interne Plan-IDs `pro`/`team`
- [x] Monatsmodelle ohne irreführenden Jahrespreis-Toggle
- [x] Neue, sichere Stripe-Variablen `STRIPE_PRICE_SOLO` und `STRIPE_PRICE_KANZLEI`
- [x] Navigation, Sitemap, Metadata und JSON-LD angepasst
- [x] Verbraucherhinweis und explizite Negativabgrenzung integriert
- [x] Unbelegte SOC-2-/ISO-Zertifizierungsclaims als Vorbereitung/geplant gekennzeichnet
- [x] Guardrail-Tests für Zielgruppen, Feature-Grenzen, Währungen und Plan-Mapping
- [x] Tailwind-Quellscan auf `src/` begrenzt; Corpus- und Script-Kommentare werden nicht als UI-Klassen interpretiert
- [x] `/pricing`, `/privat` und `/kanzlei` im lokalen Browser auf Laufzeitfehler geprüft
- [x] Pricing bei 390 px ohne horizontalen Overflow geprüft
- [x] Vollständiger TypeScript-Check erfolgreich

## Produktmatrix

| Fähigkeit                       |   Privat |         Solo |     Kanzlei |      Enterprise |
| ------------------------------- | -------: | -----------: | ----------: | --------------: |
| Definierte Einzelfrage          |       Ja |           Ja |          Ja |              Ja |
| Dokumentanalyse mit Fundstellen | Begrenzt |           Ja |          Ja |              Ja |
| Professionelle Aktenverwaltung  |     Nein | Eigene Akten |   Teamakten |     Individuell |
| Nutzer                          | 1 privat |            1 | 5 inklusive |     Individuell |
| Massen-Ingest                   |     Nein |         Nein |          Ja |     High Volume |
| Rollen und Aktenrechte          |     Nein |         Nein |          Ja | Individuell/SSO |
| Geteiltes Kanzleiwissen         |     Nein |         Nein |          Ja |              Ja |
| WhatsApp-Workflows              |     Nein |         Nein |          Ja |     Individuell |
| DATEV/Kalender/Workflows        |     Nein |     Begrenzt |          Ja |     Individuell |
| On-Premise, SSO/SAML, SLA       |     Nein |         Nein |        Nein |              Ja |

## Noch vor Produktion erforderlich

### P0 – Checkout und Berechtigungen

- [ ] In Stripe neue monatliche Preise anlegen: Solo 179 EUR, Kanzlei 999 EUR inklusive fünf Nutzern; Steuerverhalten und Rechnungsangaben prüfen.
- [ ] Die Price-IDs als `STRIPE_PRICE_SOLO` und `STRIPE_PRICE_KANZLEI` setzen. Die alten Pro/Team-IDs nicht wiederverwenden, damit kein Altpreis versehentlich abgerechnet wird.
- [ ] Stripe-Testcheckout für beide Pläne durchführen und Webhook-Mapping `pro`/`team` kontrollieren.
- [ ] Privatprodukte erst kaufbar schalten, wenn Fallkontingente, Zahlung, Widerruf, Verbraucherinformationen und Entitlement-Prüfung serverseitig vorhanden sind. Bis dahin dienen die CTAs als Registrierung/Interessenpfad.
- [ ] Serverautorisierung für Massen-Ingest, Teamrollen und WhatsApp prüfen: UI-Ausblendung allein reicht nicht.

### P0 – Recht und Claims

- [ ] Verbrauchertexte, Leistungsbeschreibung, Widerruf und Haftung anwaltlich prüfen lassen.
- [ ] Jede Compliance-Aussage gegen `docs/security/SECURITY_QUESTIONNAIRE.md` abgleichen.
- [ ] Vor Veröffentlichung prüfen, dass nirgends eine Zertifizierung, Integration oder Rechtsberatung behauptet wird, die nicht nachweisbar produktiv ist.

### P1 – Privater Produktpfad

- [ ] `audience=private` bei Registrierung persistieren.
- [ ] Privates Dashboard ohne Akten-, Team-, DATEV- und WhatsApp-Navigation bereitstellen.
- [ ] Serverseitige Limits für Dokumentzahl, Fallzahl, Speicher und Exporte einführen.
- [ ] Fallbezogene Lösch- und Aufbewahrungsregeln sowie verständlichen Datenexport implementieren.
- [ ] Übergabe an eine Kanzlei nur mit ausdrücklicher Einwilligung und protokolliertem Datentransfer ermöglichen.

### P1 – Kanzlei-Onboarding

- [ ] Solo-zu-Kanzlei-Upgrade ohne Datenmigration testen.
- [ ] Kanzlei-Onboarding für fünf Nutzer, Rollen, initialen Massen-Ingest und WhatsApp-Verknüpfung bauen.
- [ ] Verbrauchsanzeige und Mehrkosten vor Nutzung verbindlich anzeigen.
- [ ] Enterprise-Anfragen in einen technischen Discovery-Prozess mit Security Questionnaire, DPA und Migrationsscope führen.

### P1 – Messung

- [ ] Events `audience_selected`, `plan_viewed`, `signup_started`, `checkout_started` und `checkout_completed` mit Zielgruppe und Plan erfassen.
- [ ] Funnels Privat und Kanzlei strikt getrennt auswerten.
- [ ] Fehlklassifikationen messen: Nutzer, die nach Einstieg in den jeweils anderen Pfad wechseln.

## Abnahmekriterien

- Kein Privatnutzer kann per direktem API-Aufruf Kanzleifunktionen verwenden.
- Alle sichtbaren Preise entsprechen exakt den konfigurierten Stripe-Preisen.
- Jede CTA führt zu einem existierenden, zielgruppengerechten nächsten Schritt.
- Wechsel Solo → Kanzlei erhält Akten, Quellen, Nutzeridentität und Audit-Trail.
- Desktop und Mobile bestehen Navigation, Pricing-Tabs, Fokusführung, Kontrast und Overflow-Prüfung.
- TypeScript, relevante Unit-Tests, Produktions-Build und Marketing-E2E laufen im sauberen Hauptbranch grün.
