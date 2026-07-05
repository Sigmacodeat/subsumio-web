/**
 * AT Law Corpus Verification Script
 *
 * Prüft die Vollständigkeit des österreichischen Normkorpus auf dem Produktionsserver.
 * Fokus: § 6 AHG und § 1489 ABGB müssen Volltext haben (nicht nur Überschriften).
 *
 * Usage:
 *   bun run scripts/verify-at-law-corpus.ts [SERVER_URL]
 *
 * Default server: http://localhost:13131 (SSH tunnel to engine on Hetzner)
 * For on-server execution: use scripts/verify-at-engine.js
 */

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const SERVER_URL = getArg("--engine") ?? process.env.SUBSUMIO_API_URL ?? "http://localhost:13131";
const API_TOKEN =
  getArg("--key") ?? process.env.SUBSUMIO_API_TOKEN ?? process.env.SUBSUMIO_WEB_API_KEY ?? "";
const INTERNAL_SECRET = getArg("--secret") ?? process.env.SUBSUMIO_INTERNAL_SECRET ?? "";
const BRAIN_ID = getArg("--brain") ?? process.env.SUBSUMIO_BRAIN_ID ?? "brain_817d98c8";
const DEMO_EMAIL = process.env.SUBSUMIO_DEMO_EMAIL ?? "demo.agent@subsum.io";
const DEMO_PASSWORD = process.env.SUBSUMIO_DEMO_PASSWORD ?? "";

let sessionCookie = "";

// Slug mapping: law abbreviation → engine slug prefix
const SLUG_MAP: Record<string, string> = {
  ahg: "ahg",
  abgb: "abgb",
  stgb: "stgb-at",
  stpo: "stpo-at",
  asvg: "asvg",
  dsg: "dsg-at",
  spg: "spg",
  bdg: "bdg",
};

function buildSlug(abbr: string, section: string): string {
  const mapped = SLUG_MAP[abbr] ?? abbr;
  return `law/at/${mapped}/${section}`;
}

interface CorpusEntry {
  slug: string;
  title: string;
  jurisdiction: string;
  word_count: number;
  has_fulltext: boolean;
  sections: number;
}

interface VerifyResult {
  norm: string;
  slug: string;
  found: boolean;
  word_count: number;
  has_fulltext: boolean;
  sections_found: string[];
  status: "OK" | "INCOMPLETE" | "MISSING" | "ERROR";
  detail: string;
}

const CRITICAL_NORMS = [
  {
    norm: "§ 6 AHG",
    abbr: "ahg",
    section: "6",
    min_words: 80,
    expected_sections: ["Abs 1", "Abs 2", "Abs 3"],
  },
  { norm: "§ 1489 ABGB", abbr: "abgb", section: "1489", min_words: 10, expected_sections: [] },
  { norm: "§ 1 AHG", abbr: "ahg", section: "1", min_words: 80, expected_sections: [] },
  { norm: "§ 8 AHG", abbr: "ahg", section: "8", min_words: 80, expected_sections: [] },
  { norm: "§ 9 AHG", abbr: "ahg", section: "9", min_words: 80, expected_sections: [] },
  { norm: "§ 1497 ABGB", abbr: "abgb", section: "1497", min_words: 30, expected_sections: [] },
  { norm: "§ 146 StGB", abbr: "stgb", section: "146", min_words: 30, expected_sections: [] },
  { norm: "§ 147 StGB", abbr: "stgb", section: "147", min_words: 80, expected_sections: ["Abs 3"] },
  { norm: "§ 148 StGB", abbr: "stgb", section: "148", min_words: 20, expected_sections: [] },
  { norm: "§ 57 StGB", abbr: "stgb", section: "57", min_words: 80, expected_sections: [] },
  { norm: "§ 107 StGB", abbr: "stgb", section: "107", min_words: 50, expected_sections: [] },
  { norm: "§ 28 StPO", abbr: "stpo", section: "28", min_words: 80, expected_sections: [] },
  {
    norm: "§ 110 StPO",
    abbr: "stpo",
    section: "110",
    min_words: 100,
    expected_sections: ["Abs 1 Z 2", "Abs 1 Z 3"],
  },
  { norm: "§ 164 StPO", abbr: "stpo", section: "164", min_words: 100, expected_sections: [] },
  { norm: "§ 193 StPO", abbr: "stpo", section: "193", min_words: 80, expected_sections: ["Abs 2"] },
  { norm: "§ 195 StPO", abbr: "stpo", section: "195", min_words: 50, expected_sections: [] },
  {
    norm: "§ 100 StPO",
    abbr: "stpo",
    section: "100",
    min_words: 100,
    expected_sections: ["Abs 2 Z 3"],
  },
  { norm: "§ 67 StPO", abbr: "stpo", section: "67", min_words: 100, expected_sections: [] },
  // § 742a ASVG: COVID-19-Sonderbestimmung, mit 30.06.2023 außer Kraft getreten — korrekt absent
  {
    norm: "§ 742a ASVG",
    abbr: "asvg",
    section: "742a",
    min_words: 30,
    expected_sections: [],
    note: "COVID-19-Sonderbestimmung, mit 30.06.2023 außer Kraft getreten — korrekt nicht im Korpus",
  },
  { norm: "§ 45 DSG", abbr: "dsg", section: "45", min_words: 50, expected_sections: [] },
  // § 38a SPG: SPG wurde neu ingested und ist jetzt verfügbar
  { norm: "§ 38a SPG", abbr: "spg", section: "38a", min_words: 50, expected_sections: [] },
  // § 94 BDG: Bundesdisziplinargesetz ist nicht über RIS OGD API auflösbar
  {
    norm: "§ 94 BDG",
    abbr: "bdg",
    section: "94",
    min_words: 30,
    expected_sections: [],
    note: "Nicht über RIS API auflösbar",
  },
];

async function login(): Promise<boolean> {
  if (!DEMO_PASSWORD) {
    console.log("Kein Demo-Passwort gesetzt (SUBSUMIO_DEMO_PASSWORD) — versuche ohne Auth");
    return false;
  }
  try {
    console.log(`Login als ${DEMO_EMAIL}...`);
    const resp = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      redirect: "manual",
    });
    const setCookie = resp.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/subsumio[^;]*/i);
    if (match) {
      sessionCookie = match[0];
      console.log("Login erfolgreich, Session-Cookie erhalten");
      return true;
    }
    // Try reading from response body
    const data = await resp.json().catch(() => null);
    if (data?.token) {
      sessionCookie = `token=${data.token}`;
      console.log("Login erfolgreich, Token erhalten");
      return true;
    }
    console.error(`Login fehlgeschlagen: HTTP ${resp.status}`);
    return false;
  } catch (err) {
    console.error("Login error:", err);
    return false;
  }
}

async function fetchPage(slug: string): Promise<unknown | null> {
  const url = `${SERVER_URL}/api/pages/${slug}`;
  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (API_TOKEN) {
        headers["x-subsumio-api-key"] = API_TOKEN;
      }
      if (sessionCookie) {
        headers["Cookie"] = sessionCookie;
      }
      if (INTERNAL_SECRET) {
        headers["x-internal-secret"] = INTERNAL_SECRET;
      }
      if (BRAIN_ID) {
        headers["x-subsumio-source"] = BRAIN_ID;
      }
      const resp = await fetch(url, { headers, redirect: "manual" });
      if (!resp.ok) {
        if (attempt < maxRetries && resp.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        console.error(`  HTTP ${resp.status} for ${slug}`);
        return null;
      }
      return await resp.json();
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      console.error(`  Fetch error for ${slug}:`, err);
      return null;
    }
  }
  return null;
}

function checkSection(
  text: string,
  section: string
): { found: boolean; word_count: number; sections_found: string[] } {
  const sectionPattern = new RegExp(
    `§\\s*${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s.\\n]`,
    "i"
  );
  const match = text.match(sectionPattern);

  if (!match) {
    return { found: false, word_count: 0, sections_found: [] };
  }

  // Extrahiere Text um den Paragraphen (±2000 Zeichen)
  const idx = match.index ?? 0;
  const start = Math.max(0, idx - 200);
  const end = Math.min(text.length, idx + 3000);
  const sectionText = text.slice(start, end);

  // Zähle Wörter im Abschnitt
  const words = sectionText.split(/\s+/).filter((w) => w.length > 0).length;

  // Prüfe ob nur Überschrift (weniger als 20 Wörter = wahrscheinlich nur Heading)
  const hasFulltext = words >= 20;

  // Suche nach Unterabschnitten
  const subSections: string[] = [];
  const absPattern = /Abs\s*(\d+)/gi;
  let absMatch: RegExpExecArray | null;
  while ((absMatch = absPattern.exec(sectionText)) !== null) {
    subSections.push(`Abs ${absMatch[1]}`);
  }
  const zPattern = /Z\s*(\d+)/gi;
  let zMatch: RegExpExecArray | null;
  while ((zMatch = zPattern.exec(sectionText)) !== null) {
    subSections.push(`Z ${zMatch[1]}`);
  }

  return {
    found: true,
    word_count: words,
    sections_found: Array.from(new Set(subSections)),
  };
}

async function verifyNorm(norm: {
  norm: string;
  abbr: string;
  section: string;
  min_words: number;
  expected_sections: string[];
}): Promise<VerifyResult> {
  const slug = buildSlug(norm.abbr, norm.section);
  console.log(`\nPrüfe ${norm.norm} (${slug})...`);

  const page = await fetchPage(slug);
  if (!page) {
    return {
      norm: norm.norm,
      slug,
      found: false,
      word_count: 0,
      has_fulltext: false,
      sections_found: [],
      status: "MISSING",
      detail: `Seite ${slug} nicht gefunden`,
    };
  }

  const text = page.body ?? page.content ?? page.text ?? "";
  if (!text || text.length < 100) {
    return {
      norm: norm.norm,
      slug,
      found: false,
      word_count: 0,
      has_fulltext: false,
      sections_found: [],
      status: "INCOMPLETE",
      detail: `Seite existiert aber Text ist leer oder zu kurz (${text.length} chars)`,
    };
  }

  const { found, word_count, sections_found } = checkSection(text, norm.section);

  if (!found) {
    return {
      norm: norm.norm,
      slug,
      found: false,
      word_count: 0,
      has_fulltext: false,
      sections_found: [],
      status: "MISSING",
      detail: `§ ${norm.section} nicht im Text gefunden`,
    };
  }

  const hasFulltext = word_count >= norm.min_words;
  const allSectionsFound = norm.expected_sections.every((s) =>
    sections_found.some((sf) => sf.replace(/\s+/g, "") === s.replace(/\s+/g, ""))
  );

  let status: VerifyResult["status"] = "OK";
  let detail = `word_count=${word_count}, sections=[${sections_found.join(", ")}]`;

  if (!hasFulltext) {
    status = "INCOMPLETE";
    detail = `Volltext unvollständig: ${word_count} Wörter (erwartet ≥${norm.min_words}). Möglicherweise nur Überschrift.`;
  } else if (!allSectionsFound) {
    status = "INCOMPLETE";
    const missing = norm.expected_sections.filter(
      (s) => !sections_found.some((sf) => sf.replace(/\s+/g, "") === s.replace(/\s+/g, ""))
    );
    detail = `Fehlende Unterabschnitte: ${missing.join(", ")}`;
  }

  return {
    norm: norm.norm,
    slug,
    found: true,
    word_count,
    has_fulltext: hasFulltext,
    sections_found,
    status,
    detail,
  };
}

async function main() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("AT LAW CORPUS VERIFICATION");
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Normen: ${CRITICAL_NORMS.length}`);
  console.log("════════════════════════════════════════════════════════════════");

  // Auth: prefer internal secret, then API token, then demo login
  if (INTERNAL_SECRET) {
    console.log("Auth: using x-internal-secret");
  } else if (API_TOKEN) {
    console.log("Auth: using Bearer API token");
  } else {
    await login();
  }

  const results: VerifyResult[] = [];
  for (const norm of CRITICAL_NORMS) {
    const result = await verifyNorm(norm);
    results.push(result);
    const icon =
      result.status === "OK"
        ? "✅"
        : result.status === "INCOMPLETE"
          ? "⚠️"
          : result.status === "MISSING"
            ? "❌"
            : "💥";
    console.log(`  ${icon} ${result.norm}: ${result.status} — ${result.detail}`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("ZUSAMMENFASSUNG");
  console.log("════════════════════════════════════════════════════════════════");

  const ok = results.filter((r) => r.status === "OK").length;
  const incomplete = results.filter((r) => r.status === "INCOMPLETE").length;
  const missing = results.filter((r) => r.status === "MISSING").length;
  const errors = results.filter((r) => r.status === "ERROR").length;

  console.log(`  ✅ OK:         ${ok}/${results.length}`);
  console.log(`  ⚠️ INCOMPLETE: ${incomplete}/${results.length}`);
  console.log(`  ❌ MISSING:    ${missing}/${results.length}`);
  console.log(`  💥 ERROR:      ${errors}/${results.length}`);

  // Detail-Report für kritische Normen
  const critical = results.filter((r) => r.norm === "§ 6 AHG" || r.norm === "§ 1489 ABGB");
  console.log("\n── KRITISCHE NORMEN (Toni Gericht) ──");
  for (const c of critical) {
    const icon = c.status === "OK" ? "✅" : "⚠️";
    console.log(`  ${icon} ${c.norm}: word_count=${c.word_count}, fulltext=${c.has_fulltext}`);
    if (c.status !== "OK") {
      console.log(`     → ${c.detail}`);
    }
  }

  // Exit code
  if (missing > 0 || errors > 0) {
    process.exit(1);
  } else if (incomplete > 0) {
    process.exit(2);
  } else {
    console.log("\n✅ Alle Normen verifiziert — Korpus ist vollständig.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(99);
});
