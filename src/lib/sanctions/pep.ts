/**
 * PEP-Prüfung über OpenSanctions (WP-4.18, § 8f RAO).
 *
 * OpenSanctions betreibt den PEP-Datensatz (peps) hinter einer API mit
 * Lizenzschlüssel. Ohne OPENSANCTIONS_API_KEY bleibt die PEP-Prüfung ein
 * dokumentierter manueller Schritt — `pepScreen` liefert dann null und die
 * Kanzlei bestätigt die Prüfung wie bisher per Checkbox.
 *
 * API: POST https://api.opensanctions.org/match/peps
 * Body: { "queries": { "q1": { "schema": "Person", "properties": { "name": ["…"] } } } }
 */

export interface PepCandidate {
  name: string;
  score: number;
  /** Dataset caption, z. B. "peps". */
  datasets: string[];
  countries: string[];
  topics: string[];
}

export interface PepScreenResult {
  checkedAt: string;
  source: string;
  /** Pro geprüftem Namen die Kandidaten — ein Anwalt entscheidet. */
  results: Array<{ name: string; candidates: PepCandidate[] }>;
}

export function isPepScreenConfigured(): boolean {
  return Boolean(process.env.OPENSANCTIONS_API_KEY);
}

interface OsMatch {
  id?: string;
  caption?: string;
  score?: number;
  datasets?: string[];
  properties?: { country?: string[]; topics?: string[] };
}

/**
 * Null, wenn kein API-Key konfiguriert ist (kein Fehler — die manuelle
 * PEP-Prüfung bleibt der Fallback, und das Formular sagt das auch).
 */
export async function pepScreen(
  names: string[],
  timeoutMs = 20_000
): Promise<PepScreenResult | null> {
  const apiKey = process.env.OPENSANCTIONS_API_KEY;
  if (!apiKey) return null;
  const base = process.env.OPENSANCTIONS_URL ?? "https://api.opensanctions.org";
  const queries = Object.fromEntries(
    names
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n, i) => [`q${i}`, { schema: "Person", properties: { name: [n] } }])
  );
  if (Object.keys(queries).length === 0) {
    return { checkedAt: new Date().toISOString(), source: "OpenSanctions PEP", results: [] };
  }
  const res = await fetch(`${base}/match/peps?threshold=0.7&limit=5`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${apiKey}`,
    },
    body: JSON.stringify({ queries }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`OpenSanctions nicht erreichbar: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    responses?: Record<string, { results?: OsMatch[] }>;
  };
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const results = clean.map((name, i) => {
    const raw = data.responses?.[`q${i}`]?.results ?? [];
    const candidates: PepCandidate[] = raw.map((m) => ({
      name: m.caption ?? "",
      score: Math.round((m.score ?? 0) * 100) / 100,
      datasets: m.datasets ?? [],
      countries: m.properties?.country ?? [],
      topics: m.properties?.topics ?? [],
    }));
    return { name, candidates };
  });
  return {
    checkedAt: new Date().toISOString(),
    source: "OpenSanctions PEP-Datensatz",
    results,
  };
}
