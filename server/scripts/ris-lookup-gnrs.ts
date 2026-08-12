#!/usr/bin/env bun
/**
 * Search RIS by title to find correct Gesetzesnummern for key Austrian laws.
 */
const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const RIS_UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };

const searches = [
  "Allgemeines bürgerliches Gesetzbuch",
  "Strafgesetzbuch",
  "Strafprozessordnung",
  "Zivilprozessordnung",
  "Unternehmensgesetzbuch",
  "Ehegesetz",
  "Exekutionsordnung",
  "Aktiengesetz",
  "GmbH-Gesetz",
  "Handelsgesetzbuch",
  "Gewerbeordnung 1994",
  "Einkommensteuergesetz 1988",
  "Bundesabgabenordnung",
  "Umsatzsteuergesetz 1994",
  "Konsumentenschutzgesetz",
  "Arbeitsverfassungsgesetz",
  "Angestelltengesetz",
  "Mutterschutzgesetz",
  "Urlaubsgesetz",
  "Datenschutzgesetz",
  "Wettbewerbsgesetz",
  "Verbrauchergewährleistungsgesetz",
  "Mietrechtsgesetz",
  "Allgemeines Verwaltungsverfahrensgesetz",
  "Verwaltungsstrafgesetz",
];

for (const title of searches) {
  const url = `${RIS_API}?Applikation=BrKons&Titel=${encodeURIComponent(title)}&DokumenteProSeite=OneHundred&Seitennummer=1`;
  try {
    const res = await fetch(url, { headers: RIS_UA });
    const data = await res.json() as any;
    let refs = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;
    if (!refs) { console.log(`${title}: NO RESULTS`); continue; }
    if (!Array.isArray(refs)) refs = [refs];
    const byGnr = new Map<string, string>();
    for (const ref of refs) {
      const bund = ref?.Data?.Metadaten?.Bundesrecht;
      const brKons = bund?.BrKons;
      if (brKons?.Gesetzesnummer) {
        const kt = (bund.Kurztitel || "").trim();
        if (!byGnr.has(brKons.Gesetzesnummer)) byGnr.set(brKons.Gesetzesnummer, kt);
      }
    }
    const entries = [...byGnr.entries()];
    const lower = title.toLowerCase();
    const best = entries.find(([_, kt]) => kt.toLowerCase().includes(lower.split(" ")[0]));
    if (best) {
      console.log(`${title.padEnd(45)} -> Gnr: ${best[0]}, "${best[1]}"`);
    } else {
      console.log(`${title.padEnd(45)} -> ${entries.length} laws, first: ${entries[0]?.[0] || "?"} "${(entries[0]?.[1] || "").slice(0,60)}"`);
    }
  } catch (e: any) {
    console.log(`${title}: ERROR ${e}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
