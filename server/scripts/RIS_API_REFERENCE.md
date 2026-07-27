# RIS OGD API v2.6 — Complete Reference

Base URL: `https://data.bka.gv.at/ris/api/v2.6`
User-Agent: `subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)`

## 6 Endpoints

| #   | Endpoint      | Applikation | Total Docs  | Corpus Dir        |
| --- | ------------- | ----------- | ----------- | ----------------- |
| 1   | `Bundesrecht` | `BrKons`    | 439.943     | `at/`             |
| 2   | `Landesrecht` | `LrKons`    | 279.786     | `at-landesrecht/` |
| 3   | `Judikatur`   | (multiple)  | (see below) | `at-judikatur-*`  |
| 4   | `Sonstige`    | (multiple)  | (see below) | `at-*`            |
| 5   | `Bezirke`     | (none)      | 2.484       | `at-bezirke/`     |
| 6   | `Gemeinden`   | (none)      | 18.384      | `at-gemeinden/`   |

## Query Parameters

| Parameter           | Values             | Required      | Notes                     |
| ------------------- | ------------------ | ------------- | ------------------------- |
| `Applikation`       | varies by endpoint | Yes for 1-4   | Filter by sub-application |
| `DokumenteProSeite` | `OneHundred`       | Yes           | Max 100 per page          |
| `Seitennummer`      | `1`, `2`, ...      | Yes           | 1-based pagination        |
| `AlleRechtssaetze`  | `true`             | For Judikatur | Include all Rechtssaetze  |

## Judikatur Applikationen

| Applikation | Label  | Total   | Corpus Dir             | Corpus Count |
| ----------- | ------ | ------- | ---------------------- | ------------ |
| `Justiz`    | OGH    | 138.435 | `at-judikatur/`        | 53.714       |
| `Vwgh`      | VwGH   | 356.540 | `at-judikatur-vwgh/`   | 104.542      |
| `Vfgh`      | VfGH   | 24.082  | `at-judikatur-vfgh/`   | 17.801       |
| `AsylGH`    | AsylGH | 53.113  | `at-judikatur-asylgh/` | 52.170       |
| `Bvwg`      | BVwG   | 287.732 | `at-judikatur-bvwg/`   | 44.902       |
| `Lvwg`      | LVwG   | 76.507  | `at-judikatur-lvwg/`   | 44.625       |
| `Uvs`       | UVS    | 25.939  | `at-judikatur-uvs/`    | 17.873       |
| `Dsk`       | DSK    | 1.873   | `at-judikatur-dsk/`    | 816          |
| `Gbk`       | GBK    | 1.042   | `at-judikatur-gbk/`    | 523          |
| `Pvak`      | PVAK   | 2.550   | `at-judikatur-pvak/`   | 665          |
| `Dok`       | DOK    | 4.822   | `at-judikatur-dok/`    | 3.022        |
| `Ubas`      | UBAS   | 4.052   | `at-judikatur-ubas/`   | 2.778        |
| `Umse`      | Umse   | 742     | `at-judikatur-umse/`   | 335          |

## Sonstige Applikationen

| Applikation | Label           | Total | Corpus Dir  | Corpus Count |
| ----------- | --------------- | ----- | ----------- | ------------ |
| `Erlaesse`  | Erlasse (BMERL) | 1.623 | `at-bmerl/` | 0            |
| `Avsv`      | AVSV            | 4.709 | `at-avsv/`  | 1.597        |
| `Avn`       | AVN             | 702   | `at-avn/`   | 422          |
| `Spg`       | SPG             | 75    | `at-spg/`   | 41           |
| `KmGer`     | KmGer           | 53    | `at-kmger/` | 17           |

## Response Structure (all endpoints)

```
OgdSearchResult
  └─ OgdDocumentResults
       ├─ Hits: { "@pageNumber", "@pageSize", "#text" (total count) }
       └─ OgdDocumentReference[] (array or single object)
            └─ Data
                 ├─ Metadaten
                 │    ├─ Technisch: { ID, Applikation, Organ, ImportTimestamp }
                 │    ├─ Allgemein: { Geaendert|Veroeffentlicht, DokumentUrl }
                 │    └─ [Endpoint-specific metadata block]
                 └─ Dokumentliste
                      └─ ContentReference
                           ├─ ContentType: "MainDocument"
                           ├─ Name: "Hauptdokument"
                           └─ Urls.ContentUrl[]: [
                                { DataType: "Xml",  Url: "https://www.ris.bka.gv.at/Dokumente/.../ID.xml" },
                                { DataType: "Html", Url: "https://www.ris.bka.gv.at/Dokumente/.../ID.html" },
                                { DataType: "Rtf",  Url: "https://www.ris.bka.gv.at/Dokumente/.../ID.rtf" },
                                { DataType: "Pdf",  Url: "https://www.ris.bka.gv.at/Dokumente/.../ID.pdf" }
                              ]
```

## Endpoint-Specific Metadata

### Bundesrecht → `Metadaten.Bundesrecht`

```json
{
  "Kurztitel": "...",
  "Titel": "...",
  "Eli": "https://ris.bka.gv.at/eli/...",
  "BrKons": {
    "Kundmachungsorgan": "BGBl. II Nr. 130/1998",
    "Typ": "V", // V=Verordnung, G=Gesetz, etc.
    "Dokumenttyp": "Norm",
    "ArtikelParagraphAnlage": "§ 0",
    "Paragraphnummer": "0",
    "StammnormPublikationsorgan": "BGBl. II Nr.",
    "StammnormBgblnummer": "130/1998",
    "NovellenPublikationsorgan": "BGBl. I Nr.",
    "NovellenBgblnummer": "61/2018",
    "NovellenBeziehung": "aufgehoben durch",
    "Inkrafttretensdatum": "1998-04-24",
    "Ausserkrafttretensdatum": "2018-12-31",
    "Indizes": { "item": "96/01 Bundesstraßengesetz 1971" },
    "Aenderung": "...",
    "Schlagworte": "...",
    "Gesetzesnummer": "10012838",
    "AlteDokumentnummer": "N9199813323I",
    "GesamteRechtsvorschriftUrl": "https://www.ris.bka.gv.at/GeltendeFassung.wxe?..."
  }
}
```

### Landesrecht → `Metadaten.Landesrecht`

```json
{
  "Kurztitel": "...",
  "Titel": "...",
  "Bundesland": "Steiermark",
  "LrKons": {
    "Kundmachungsorgan": "LGBl. Nr. 23/2025",
    "Typ": "V",
    "Dokumenttyp": "Norm",
    "ArtikelParagraphAnlage": "§ 0",
    "Paragraphnummer": "0",
    "StammnormPublikationsorgan": "LGBl. Nr.",
    "StammnormBgblnummer": "23/2025",
    "Inkrafttretensdatum": "2025-01-01",
    "Indizes": { "item": "8200 Bauordnung" },
    "Aenderung": "",
    "Gesetzesnummer": "20001882",
    "GesamteRechtsvorschriftUrl": "https://www.ris.bka.gv.at/GeltendeFassung.wxe?...",
    "Eli": "https://ris.bka.gv.at/eli/..."
  }
}
```

### Judikatur → `Metadaten.Judikatur`

```json
{
  "Dokumenttyp": "Rechtssatz",
  "Geschaeftszahl": { "item": "Ro 2026/03/0016" },
  "Normen": { "item": ["JagdG Bgld 2017 §64 Abs1 Z10", ...] },
  "Entscheidungsdatum": "2026-07-06",
  "EuropeanCaseLawIdentifier": "ECLI:AT:VWGH:2026:RO2026030016.J01",
  "Vwgh": {                              // Key varies: Vwgh, Vfgh, Justiz, AsylGH, Bvwg, Lvwg, Uvs, Dsk, Gbk, Pvak, Dok, Ubas, Umse
    "Rechtssatznummer": "1",
    "Entscheidungsart": "Erkenntnis",
    "DokumentnummerTyp": "J",
    "Stammrechtssatznummer": "JWR_...",
    "Gericht": "Verwaltungsgerichtshof (VwGH)",
    "Indizes": { "item": ["...", ...] },
    "RechtssatzketteUrl": "https://..."
  },
  "GesamteEntscheidungUrl": "https://...",
  "EntscheidungstextUrl": "https://..."
}
```

### Sonstige → `Metadaten.Sonstige`

Common fields: `Kurztitel`, `Titel`, `Kundmachungsdatum`, `Schlagworte`

App-specific sub-objects:

- `Erlaesse`: { Bundesministerium, Genehmigungsdatum, Typ, Geschaeftszahl, Kurzinformation }
- `Avsv`: { Urheber, Avsvnummer, Dokumentart, Beschluesse: { Organ, Datum, GZ }, Kurzinformation }
- `Avn`: { Avnnummer, Typ, Inkrafttretensdatum, Geschaeftszahl, Normen, Anmerkung, Kurzinformation }
- `Spg`: { Spgnummer, Typ, Land, Kurzinformation, Inkrafttretensdatum }
- `KmGer`: { Gericht, GZ, Typ, Kurzinformation, Inkrafttretensdatum }

### Bezirke → `Metadaten.Bezirke`

```json
{
  "Kurztitel": "...",
  "Titel": "...",
  "Bundesland": "Burgenland",
  "Bvb": {
    "Kundmachungsdatum": "2026-07-24",
    "Kundmachungsorgan": "VBl. ND Nr.",
    "Kundmachungsnummer": "25/2026",
    "Typ": "Verordnung",
    "Bezirksverwaltungsbehoerde": "Bezirkshauptmannschaft Neusiedl am See"
  }
}
```

### Gemeinden → `Metadaten.Gemeinden`

```json
{
  "Kurztitel": "...",
  "Titel": "...",
  "Bundesland": "Kärnten",
  "Gemeinde": "Afritz am See",
  "Typ": "Verordnung",
  "Geschaeftszahl": { "item": "000-/902-/2020/me." },
  "Gr": {
    "HomepageDerLandesregierung": "https://www.ktn.gv.at",
    "HomepageDerGemeinde": "https://www.afritz.gv.at/",
    "Inkrafttretensdatum": "2020-12-16",
    "Indizes": { "item": "9 Finanzwirtschaft" }
  }
}
```

## Content Fetching

Every document provides 4 content formats via `Dokumentliste.ContentReference.Urls.ContentUrl[]`:

- **XML**: Richest structured format (RIS XML schema with `<ueberschrift>`, `<absatz>`, `<liste>`, etc.)
- **HTML**: Formatted HTML
- **RTF**: Rich Text Format
- **PDF**: PDF document

For Legal AI: **XML is preferred** — parse with `risXmlToText()` from `backfill-utils.ts`.

## Rate Limiting

- 500ms delay between requests (off-hours)
- RIS OGD API has no documented rate limit, but be polite
- Use `acquireRisLock` / `releaseRisLock` for concurrent processes

## Important Notes

1. `OgdDocumentReference` can be an array OR a single object — always handle both
2. `Geschaeftszahl` and `Normen` fields use `{ "item": "..." }` or `{ "item": [...] }` — handle both
3. `Indizes` same pattern: `{ "item": "..." }` or `{ "item": [...] }`
4. Some fields contain HTML (`<br/>`) in metadata — strip when saving
5. `AlleRechtssaetze=true` is critical for Judikatur to get all Rechtssaetze, not just the latest
