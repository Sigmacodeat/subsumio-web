import { ENGINE_URL } from "@/lib/engine";

/**
 * Parties typed into the matter wizard (client, opponent, court) become
 * legal_contact pages and are linked to the matter. Without this the Kontakte
 * module stayed empty and a party only existed as free text inside one case.
 *
 * Best-effort: never blocks matter creation. Existing contacts are reused by
 * normalised name; new ones are created with the same slug scheme the
 * contacts page uses.
 */

type ContactRole = "client" | "opponent" | "court";

interface ContactPage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export interface CaseContactLinks {
  client_slug?: string;
  opponent_slugs?: string[];
  court_slug?: string;
}

export function normalizeContactName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "").trim();
}

export function contactSlugFor(name: string, now = Date.now()): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-|-$/g, "");
  return `contact/${base || "kontakt"}-${now.toString(36)}`;
}

async function listContacts(headers: Record<string, string>): Promise<ContactPage[]> {
  const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_contact&limit=500`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as unknown;
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { pages?: unknown[] })?.pages)
      ? (raw as { pages: unknown[] }).pages
      : [];
  return arr.filter((p): p is ContactPage => !!p && typeof (p as ContactPage).slug === "string");
}

async function createContact(
  headers: Record<string, string>,
  name: string,
  role: ContactRole
): Promise<string | null> {
  const slug = contactSlugFor(name);
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      slug,
      title: name,
      type: "legal_contact",
      content: "",
      frontmatter: { type: "legal_contact", role, name, source: "case_intake" },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { slug?: string } | null;
  return data?.slug ?? slug;
}

/**
 * Resolve (or create) the contacts for the parties in a legal_case frontmatter.
 * Returns only the link fields that were missing.
 */
export async function ensureCaseContacts(
  headers: Record<string, string>,
  fm: Record<string, unknown>
): Promise<CaseContactLinks> {
  const links: CaseContactLinks = {};
  const wanted: Array<{ role: ContactRole; name: string; assign: (slug: string) => void }> = [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (str(fm.client_name) && !str(fm.client_slug)) {
    wanted.push({
      role: "client",
      name: str(fm.client_name),
      assign: (s) => (links.client_slug = s),
    });
  }
  const hasOpponentSlugs = Array.isArray(fm.opponent_slugs) && fm.opponent_slugs.length > 0;
  if (str(fm.opponent_name) && !hasOpponentSlugs) {
    wanted.push({
      role: "opponent",
      name: str(fm.opponent_name),
      assign: (s) => (links.opponent_slugs = [s]),
    });
  }
  if (str(fm.court_name) && !str(fm.court_slug)) {
    wanted.push({ role: "court", name: str(fm.court_name), assign: (s) => (links.court_slug = s) });
  }
  if (wanted.length === 0) return links;

  try {
    const existing = await listContacts(headers);
    const bySlugName = new Map<string, string>();
    for (const c of existing) {
      const n = str(c.frontmatter?.name) || str(c.title);
      if (n) bySlugName.set(normalizeContactName(n), c.slug);
    }
    for (const w of wanted) {
      const key = normalizeContactName(w.name);
      const found = bySlugName.get(key);
      if (found) {
        w.assign(found);
        continue;
      }
      const created = await createContact(headers, w.name, w.role);
      if (created) {
        bySlugName.set(key, created);
        w.assign(created);
      }
    }
  } catch {
    // contacts are a convenience; the matter must still be created
  }
  return links;
}
