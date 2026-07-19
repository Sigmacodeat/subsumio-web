# Literatur- & Materialien-Korpus (Phase 1: freie Quellen)

Stand: 2026-07-18. Dieser Tier ergänzt das Primärrecht (Statuten + Judikatur)
um **Sekundärliteratur** und **Gesetzesmaterialien** — die Lücke, die
Beck-Noxtua (beck-online), Libra (Wolters Kluwer/Otto Schmidt) und Prime Legal
AI (Otto Schmidt/AnwaltVerlag) über Verlags-Content füllen. Phase 1 nutzt
ausschließlich frei lizenzierte bzw. amtliche Quellen; der Verlags-Track
(LDA Legal Data Hub) ist ein Business-Deal, kein Scraping-Ziel.

## Rechtsrahmen (warum diese Quellen, und nur diese)

- Gesetze, Urteile, **Drucksachen** sind amtliche Werke (§ 5 UrhG) — frei.
- Kommentare/Zeitschriften der Verlage sind urheberrechtlich geschützt +
  Datenbankherstellerrecht (§ 87b UrhG). Die TDM-Schranke (§ 44b UrhG) erlaubt
  Mining, **nicht** die Wiedergabe im Produkt. Darum gilt:
  **beck-online, juris, NJW, Jusletter, dejure werden nicht angefasst.**
  Die License-Registry führt diese als fail-closed-Einträge
  (`law-de-literatur-beck`, `law-de-literatur-juris`,
  `law-de-literatur-ottoschmidt`) — `checkStaticCompliance()` wirft bei jedem
  Import-Versuch.

## Quellen & Scripts

| Script (server/scripts/)                      | Quelle                           | Lizenz             | Inhalt                                                                                                       | Ziel-Dir (law-corpus/) |
| --------------------------------------------- | -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `fetch-de-gesetzesmaterialien.ts`             | DIP-API des Bundestags           | amtlich (§ 5 UrhG) | BT/BR-Drucksachen mit Volltext (Gesetzesbegründungen)                                                        | `de-materialien/`      |
| `fetch-ch-onlinekommentar.ts`                 | onlinekommentar.ch               | CC BY 4.0          | peer-reviewte Kommentare (ZGB, OR, BV, BPR, DSG, …), inkl. Zitiervorschlag + Autor:innen aus dem SSR-Payload | `ch-literatur/`        |
| `fetch-de-openrewi.ts`                        | de.wikibooks.org (MediaWiki-API) | CC BY-SA 4.0       | OpenRewi Lehr-/Fall-/Handbücher                                                                              | `de-literatur/`        |
| `fetch-oa-literatur.ts --provider alj`        | OAI-PMH alj.uni-graz.at          | Diamond OA         | Austrian Law Journal — **nur Metadaten + Abstract** (`content_scope: abstract`)                              | `at-literatur/`        |
| `fetch-oa-literatur.ts --provider suigeneris` | OAI-PMH sui-generis.ch           | CC BY-SA 4.0       | sui generis — Metadaten + Abstract                                                                           | `ch-literatur/`        |
| `fetch-oa-literatur.ts --provider vfblog`     | WP-REST verfassungsblog.de       | CC BY-SA 4.0       | Verfassungsblog-Beiträge, Volltext                                                                           | `de-literatur/`        |

Alle Scripts: idempotent (existierende Dateien werden übersprungen, `--refresh`
überschreibt), `--target N` fürs Testen, Lizenz-Gate via
`checkStaticCompliance()` aus `src/core/legal/license-registry.ts` als erste
Aktion — ohne dokumentierte, erlaubte Lizenz startet kein Fetch.

**DIP-API-Key:** Der öffentlich dokumentierte Sammel-Key ist abgelaufen
(verifiziert 2026-07-18, HTTP 401). Eigenen Key formlos per Mail an
`parlamentsdokumentation@bundestag.de` beantragen, dann `DIP_API_KEY` setzen
(siehe `server/.env.example`).

## Frontmatter-Schema

Wie Statuten, plus: `type: literatur | materialien`, `genre: kommentar |
lehrbuch | aufsatz`, `work`, `authors`, `citation` (Zitiervorschlag),
`content_scope: full | abstract`, `license` (Pflicht, mit Attributions-Hinweis).

## Slugs & Zitierformate

- Materialien: `legal/materialien/de/btd-19-27873` ← „BT-Drs. 19/27873, S. 34"
- OA-Kommentar: `legal/literatur/ch/ok-zgb53` ← „OK-ZGB Art. 53 Rn. 5" /
  „Onlinekommentar zu Art. 53 ZGB"
- `src/core/legal/literature-citations.ts` extrahiert diese Zitate und erkennt
  zusätzlich Verlags-Kommentar-Zitate (Grüneberg, Staudinger, MüKo, …) als
  `licensed_work` — **nicht auflösbar**, Grounding meldet „Verlags-Content,
  nicht im freien Korpus" statt das Zitat still zu verlieren.
- `statuteJurisdictionFromSlug` (jurisdiction.ts) kennt die neuen Slug-Präfixe;
  die Jurisdiktions-Isolation gilt unverändert.

## Import & Pipeline

`scripts/corpus-pipeline.ts` führt die vier Verzeichnisse als
`dirimport`-Sources (`law-de-materialien`, `law-de-literatur`,
`law-at-literatur`, `law-ch-literatur`). Leere/fehlende Verzeichnisse werden
als `empty` gemeldet und lösen keinen Import aus (fetch zuerst).

## Verlags-Track (Phase 2, Business)

Otto Schmidt liefert ~700 Bücher / 60 Zeitschriften / 40 Loseblattwerke über
den **LDA Legal Data Hub** (docs.legal-data-analytics.com) — dieselbe API, die
Libra, Legora und KPMG Law nutzen; LDA hat mit C.H.Beck außerdem „Frag den
Grüneberg" gebaut. Kontakt zu LDA ist der erste Schritt; AT-Verlage
(Manz/Linde/LexisNexis AT) danach. Bis ein Vertrag existiert, bleibt der
Registry-Eintrag `pending` und das Compliance-Gate geschlossen.
