import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CaseContact, CaseDetail } from "@/lib/matter-detail-types";
import type { BrainPage } from "@/lib/types";

/**
 * Contacts in the matter view: the matter's own contacts are loaded by slug,
 * every other contact of the firm is found by a server-side search — never
 * from a preloaded, capped list of recently edited contacts.
 */

/** Firm contacts are searched on the server from this many characters on. */
export const CONTACT_SEARCH_MIN = 2;
export const CONTACT_SEARCH_LIMIT = 50;
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

export function toCaseContact(p: BrainPage): CaseContact {
  const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: p.slug,
    name: String(fm.name ?? p.title ?? ""),
    role: String(fm.role ?? "other"),
    email: fm.email as string | undefined,
    phone: fm.phone as string | undefined,
  };
}

/** Slugs of the contacts a matter links to (client, opponents, court, own lawyer). */
export function linkedContactSlugs(caseData: CaseDetail | null | undefined): string[] {
  if (!caseData) return [];
  const slugs = new Set<string>();
  if (caseData.clientSlug) slugs.add(caseData.clientSlug);
  caseData.opponentSlugs?.forEach((s) => slugs.add(s));
  if (caseData.courtSlug) slugs.add(caseData.courtSlug);
  if (caseData.ownLawyerSlug) slugs.add(caseData.ownLawyerSlug);
  return [...slugs];
}

/**
 * The matter's client among the loaded contacts — the recipient of client
 * messages (WhatsApp, e-mail). Never another contact with the role "client".
 */
export function matterClientContact(
  caseData: Pick<CaseDetail, "clientSlug"> | null | undefined,
  contacts: CaseContact[]
): CaseContact | undefined {
  const slug = caseData?.clientSlug;
  return slug ? contacts.find((c) => c.slug === slug) : undefined;
}

/** The matter's linked contacts, read by slug (missing pages are left out). */
export async function loadLinkedContacts(
  caseData: CaseDetail | null | undefined
): Promise<CaseContact[]> {
  const slugs = linkedContactSlugs(caseData);
  if (slugs.length === 0) return [];
  const pages = await api.brain.getPages(slugs);
  return Object.values(pages ?? {})
    .filter((p): p is BrainPage => Boolean(p?.slug))
    .map(toCaseContact);
}

export type ContactSearchState = "idle" | "loading" | "failed";

/**
 * Debounced server-side search over every contact of the firm (name, e-mail,
 * company). `results` is null while the term is shorter than
 * CONTACT_SEARCH_MIN or the search failed.
 */
export function useContactSearch(term: string): {
  results: CaseContact[] | null;
  state: ContactSearchState;
  /** The result hit the limit — more contacts match; refine the term. */
  limited: boolean;
} {
  const [results, setResults] = useState<CaseContact[] | null>(null);
  const [state, setState] = useState<ContactSearchState>("idle");
  const q = term.trim();
  useEffect(() => {
    if (q.length < CONTACT_SEARCH_MIN) {
      setResults(null);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    const timer = setTimeout(() => {
      api.brain
        .listPages({ type: "legal_contact", q, limit: CONTACT_SEARCH_LIMIT })
        .then((pages) => {
          if (cancelled) return;
          setResults(pages.map(toCaseContact));
          setState("idle");
        })
        .catch(() => {
          if (cancelled) return;
          setResults(null);
          setState("failed");
        });
    }, CONTACT_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);
  return {
    results,
    state,
    limited: results !== null && results.length >= CONTACT_SEARCH_LIMIT,
  };
}
