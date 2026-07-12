/**
 * Live statute source comparison for DACH jurisdictions.
 *
 * - AT: RIS-OGD API v2.6 (Bundesrecht) — queries the Austrian legal
 *   information system for current statute version dates.
 * - DE: buzer.de API — queries German federal laws for version dates.
 * - CH: Fedlex / OpenCaseLaw legislation endpoint — queries Swiss
 *   federal laws for consolidation dates.
 *
 * All sources are public APIs, no authentication required.
 * Used by the statute_currency_check operation to compare brain
 * statute versions against live authoritative sources.
 */

export interface LiveStatuteVersion {
  statute_id: string;
  jurisdiction: "at" | "de" | "ch";
  source: "ris-ogd" | "buzer" | "opencaselaw";
  version_date: string | null;
  title: string | null;
  source_url: string | null;
  fetched_at: string;
}

/**
 * Query RIS-OGD (Austria) for the current version date of a statute.
 * RIS-OGD API v2.6 endpoint: Bundesrecht (Federal Law).
 *
 * The API returns documents with metadata including Inkrafttretensdatum
 * (entry into force date) and Außerkrafttretensdatum (expiry date).
 */
export async function fetchRisOgdStatuteVersion(
  statuteAbbr: string
): Promise<LiveStatuteVersion | null> {
  try {
    const url = new URL("https://data.bka.gv.at/ris/api/v2.6/bundesrecht");
    url.searchParams.set("Applikation", "BrKons");
    url.searchParams.set("Suchworte", statuteAbbr);
    url.searchParams.set("DokumenteProSeite", "Ten");
    url.searchParams.set("Seitennummer", "1");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
    const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
    const rawRefs = docResults?.OgdDocumentReference;
    const refs: Array<Record<string, unknown>> = Array.isArray(rawRefs)
      ? (rawRefs as Array<Record<string, unknown>>)
      : rawRefs && typeof rawRefs === "object"
        ? [rawRefs as Record<string, unknown>]
        : [];

    if (refs.length === 0) return null;

    // Find the best match — look for the main statute document (not a specific section)
    let bestRef: Record<string, unknown> | null = null;
    let bestDate: string | null = null;

    for (const ref of refs) {
      const metadaten = ((ref.Data as Record<string, unknown> | undefined)?.Metadaten ??
        {}) as Record<string, unknown>;
      const technisch = (metadaten.Technisch ?? {}) as Record<string, unknown>;
      const allgemein = (metadaten.Allgemein ?? {}) as Record<string, unknown>;
      const br = (metadaten.Bundesrecht ?? {}) as Record<string, unknown>;

      const title = String(br.Kurztitel ?? br.Titel ?? "");
      // Check if this is the main statute (not a paragraph)
      const isMainStatute = !String(technisch.ID ?? "").includes("/");

      // Get the latest version date (Inkrafttretensdatum)
      const inKraft = String(allgemein.Veroeffentlicht ?? br.Inkrafttretensdatum ?? "");
      const date = inKraft || null;

      if (isMainStatute || (!bestRef && title.toLowerCase().includes(statuteAbbr.toLowerCase()))) {
        bestRef = ref;
        bestDate = date;
        if (isMainStatute) break;
      }
    }

    if (!bestRef) bestRef = refs[0]!;
    if (!bestRef) return null;

    const meta = ((bestRef.Data as Record<string, unknown> | undefined)?.Metadaten ?? {}) as Record<
      string,
      unknown
    >;
    const br = (meta.Bundesrecht ?? {}) as Record<string, unknown>;
    const technisch = (meta.Technisch ?? {}) as Record<string, unknown>;
    const allgemein = (meta.Allgemein ?? {}) as Record<string, unknown>;
    const title = String(br.Kurztitel ?? br.Titel ?? statuteAbbr);
    const docUrl = String(
      allgemein.DokumentUrl ??
        `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BrKons&Dokumentnummer=${technisch.ID ?? ""}`
    );

    return {
      statute_id: statuteAbbr,
      jurisdiction: "at",
      source: "ris-ogd",
      version_date: bestDate,
      title,
      source_url: docUrl,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Query RIS-OGD by Gesetzesnummer (law number) — more reliable than text search
 * for AT laws with non-standard abbreviations.
 */
export async function fetchRisOgdByGesetzesnummer(
  gesetzesnummer: string,
  statuteAbbr: string
): Promise<LiveStatuteVersion | null> {
  try {
    const url = new URL("https://data.bka.gv.at/ris/api/v2.6/bundesrecht");
    url.searchParams.set("Applikation", "BrKons");
    url.searchParams.set("Gesetzesnummer", gesetzesnummer);
    url.searchParams.set("DokumenteProSeite", "Ten");
    url.searchParams.set("Seitennummer", "1");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
    const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
    const rawRefs = docResults?.OgdDocumentReference;
    const refs: Array<Record<string, unknown>> = Array.isArray(rawRefs)
      ? (rawRefs as Array<Record<string, unknown>>)
      : rawRefs && typeof rawRefs === "object"
        ? [rawRefs as Record<string, unknown>]
        : [];

    if (refs.length === 0) return null;

    let bestRef: Record<string, unknown> | null = null;
    let bestDate: string | null = null;

    for (const ref of refs) {
      const metadaten = ((ref.Data as Record<string, unknown> | undefined)?.Metadaten ??
        {}) as Record<string, unknown>;
      const technisch = (metadaten.Technisch ?? {}) as Record<string, unknown>;
      const allgemein = (metadaten.Allgemein ?? {}) as Record<string, unknown>;
      const br = (metadaten.Bundesrecht ?? {}) as Record<string, unknown>;

      const isMainStatute = !String(technisch.ID ?? "").includes("/");
      const inKraft = String(allgemein.Veroeffentlicht ?? br.Inkrafttretensdatum ?? "");
      const date = inKraft || null;

      if (isMainStatute) {
        bestRef = ref;
        bestDate = date;
        break;
      }
    }

    if (!bestRef) bestRef = refs[0]!;
    if (!bestRef) return null;

    const meta = ((bestRef.Data as Record<string, unknown> | undefined)?.Metadaten ?? {}) as Record<
      string,
      unknown
    >;
    const br = (meta.Bundesrecht ?? {}) as Record<string, unknown>;
    const technisch = (meta.Technisch ?? {}) as Record<string, unknown>;
    const allgemein = (meta.Allgemein ?? {}) as Record<string, unknown>;
    const title = String(br.Kurztitel ?? br.Titel ?? statuteAbbr);
    const docUrl = String(
      allgemein.DokumentUrl ??
        `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=BrKons&Dokumentnummer=${technisch.ID ?? ""}`
    );

    return {
      statute_id: statuteAbbr,
      jurisdiction: "at",
      source: "ris-ogd",
      version_date: bestDate,
      title,
      source_url: docUrl,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Query buzer.de for the current version date of a German federal law.
 * buzer.de provides a search API and detail pages with version metadata.
 *
 * The API returns HTML pages with "Stand: DD.MM.YYYY" (as-of date)
 * which indicates the last amendment date.
 */
export async function fetchBuzerStatuteVersion(
  statuteAbbr: string
): Promise<LiveStatuteVersion | null> {
  // buzer.de uses mixed-case URLs (StGB, StPO, BauGB, etc.)
  // We need an explicit mapping from lowercase corpus names to buzer.de URL slugs.
  const BUZER_MAP: Record<string, string> = {
    bgb: "BGB", gg: "GG", hgb: "HGB", stgb: "StGB", stpo: "StPO",
    zpo: "ZPO", ao: "AO", estg: "EStG", kstg: "KStG", ustg: "UStG",
    gewstg: "GewStG", gmbhg: "GmbHG", baugb: "BauGB", bewg: "BewG",
    betrvg: "BetrVG", inso: "InsO", vwgo: "VwGO", zvg: "ZVG",
    urhg: "UrhG", gewo: "GewO", famfg: "FamFG", erbstg: "ErbStG",
    bdsg: "BDSG", stbvv: "StBVV", rvg: "RVG", uwg: "UWG",
    lstdv: "LStDV", grestg: "GrEStG", stberg: "StBerG",
    aoIndex: "AO",
  };
  const buzerAbbr = BUZER_MAP[statuteAbbr.toLowerCase()] ?? statuteAbbr.toUpperCase();
  const lawUrl = `https://www.buzer.de/${encodeURIComponent(buzerAbbr)}.htm`;

  let detailRes: Response;
  try {
    detailRes = await fetch(lawUrl, {
      headers: { Accept: "text/html", "User-Agent": "Subsumio-LegalBrain/1.0" },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
  } catch {
    return null;
  }
  if (!detailRes.ok) return null;

  const detailHtml = await detailRes.text();

  // Extract title from the page
  const titleMatch = detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const lawTitle = titleMatch
    ? titleMatch[1]!.replace(/&[a-z]+;/g, "").trim()
    : statuteAbbr;

  let versionDate: string | null = null;

  // Pattern 1: "zuletzt geändert durch ... G. v. DD.MM.YYYY" (law amendment)
  const geaendertMatch = detailHtml.match(
    /zuletzt\s+ge(?:ä|ae)ndert\s+durch\s+[^<]*?(?:G|V)\.\s*v\.\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i
  );
  if (geaendertMatch) {
    const [, day, month, year] = geaendertMatch;
    versionDate = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
  }

  // Pattern 2: "neugefasst durch B. v. DD.MM.YYYY" (consolidated version)
  if (!versionDate) {
    const neugefasstMatch = detailHtml.match(
      /neugefasst\s+durch\s+[^<]*?B\.\s*v\.\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i
    );
    if (neugefasstMatch) {
      const [, day, month, year] = neugefasstMatch;
      versionDate = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
    }
  }

  // Pattern 3: "Stand: DD.MM.YYYY" (fallback)
  if (!versionDate) {
    const standMatch = detailHtml.match(/Stand:\s*(\d{1,2})\.\s*(\d{1,2})\.(\d{4})/i);
    if (standMatch) {
      const [, day, month, year] = standMatch;
      versionDate = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
    }
  }

  return {
    statute_id: statuteAbbr,
    jurisdiction: "de",
    source: "buzer",
    version_date: versionDate,
    title: lawTitle,
    source_url: lawUrl,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Query OpenCaseLaw legislation endpoint for Swiss federal law version.
 * Uses the /api/laws/{abbreviation} endpoint which returns consolidation_date.
 */
export async function fetchOpenCaseLawStatuteVersion(
  statuteAbbr: string
): Promise<LiveStatuteVersion | null> {
  try {
    const url = `${OPENCASELAW_BASE}/laws/${encodeURIComponent(statuteAbbr)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const consolidationDate =
      typeof data.consolidation_date === "string" ? data.consolidation_date : null;
    const title = typeof data.title === "string" ? data.title : statuteAbbr;
    const srNumber = typeof data.sr_number === "string" ? data.sr_number : null;

    return {
      statute_id: statuteAbbr,
      jurisdiction: "ch",
      source: "opencaselaw",
      version_date: consolidationDate,
      title,
      source_url: srNumber ? `https://www.fedlex.admin.ch/eli/cc/${srNumber}` : null,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

const OPENCASELAW_BASE = "https://mcp.opencaselaw.ch/api";

/**
 * Fetch live statute version from the appropriate external source
 * based on jurisdiction.
 */
export async function fetchLiveStatuteVersion(
  jurisdiction: "at" | "de" | "ch",
  statuteAbbr: string
): Promise<LiveStatuteVersion | null> {
  switch (jurisdiction) {
    case "at":
      return fetchRisOgdStatuteVersion(statuteAbbr);
    case "de":
      return fetchBuzerStatuteVersion(statuteAbbr);
    case "ch":
      return fetchOpenCaseLawStatuteVersion(statuteAbbr);
    default:
      return null;
  }
}

/**
 * Batch fetch live statute versions for multiple statutes.
 * Processes sequentially with a small delay to be respectful to APIs.
 */
export async function fetchLiveStatuteVersions(
  jurisdiction: "at" | "de" | "ch",
  statuteAbbrs: string[]
): Promise<LiveStatuteVersion[]> {
  const results: LiveStatuteVersion[] = [];
  for (const abbr of statuteAbbrs) {
    const result = await fetchLiveStatuteVersion(jurisdiction, abbr);
    if (result) results.push(result);
    // Small delay between requests
    await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}
