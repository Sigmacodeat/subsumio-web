/**
 * Natural Language Console engine (v0.43.0).
 * Simple keyword-based intent recognition for admin dashboard queries.
 * No external AI required — uses regex patterns for fast, deterministic parsing.
 */

export interface NLQuery {
  intent: 'brain_status' | 'page_links' | 'page_backlinks' | 'search' | 'health' | 'agents' | 'unknown';
  /** Extracted slug target for link/backlink intents */
  slug?: string;
  /** Extracted search query */
  query?: string;
  /** Original user input */
  original: string;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'for', 'of', 'to', 'from', 'by', 'with', 'about', 'show', 'me', 'us', 'please', 'wie', 'viele', 'zeige', 'von', 'nach', 'für', 'die', 'der', 'das']);

/**
 * Tokenize and strip stop words for keyword matching.
 */
function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\-_\/\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOP_WORDS.has(t));
}

/**
 * Try to extract a slug-like pattern from text (e.g. "people/alice" or "alice").
 */
function extractSlug(tokens: string[]): string | undefined {
  for (const t of tokens) {
    // Direct slug pattern: category/name
    if (/^[a-z][a-z0-9_-]*\/[a-z][a-z0-9_-]*$/.test(t)) {
      return t;
    }
  }
  // If no direct slug, try to infer from context (heuristic: token after "von", "from", "of")
  // For simplicity, return the last token that looks like a name
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^[a-z][a-z0-9_-]+$/.test(tokens[i]!) && tokens[i]!.length > 1) {
      return tokens[i];
    }
  }
  return undefined;
}

/**
 * Parse a natural language query into an actionable intent.
 */
export function parseNLQuery(input: string): NLQuery {
  const lower = input.toLowerCase().trim();
  const tokens = tokenize(lower);

  // ── Backlinks (incoming) ── checked FIRST because "links" is also a status word
  const backlinkWords = ['backlink', 'incoming', 'points to', 'links to', 'verweist', 'eingehend'];
  if (backlinkWords.some((w) => lower.includes(w))) {
    const slug = extractSlug(tokens);
    return { intent: 'page_backlinks', slug, original: input };
  }

  // ── Outgoing links ── checked before status so "links from X" routes correctly
  const linkWords = ['outgoing', 'connected to', 'verbindungen', 'ausgehend'];
  if (linkWords.some((w) => lower.includes(w)) || /^links (from|of|for|zu|von)/.test(lower)) {
    const slug = extractSlug(tokens);
    return { intent: 'page_links', slug, original: input };
  }

  // ── Brain status / overview ──
  const statusWords = ['status', 'overview', 'sources', 'chunks', 'brain', 'zustand', 'übersicht'];
  if (statusWords.some((w) => lower.includes(w))) {
    return { intent: 'brain_status', original: input };
  }
  // "how many pages/links" also routes to status
  if (/\b(how many|wie viele)\b.*\b(pages|links|chunks|sources)\b/.test(lower)) {
    return { intent: 'brain_status', original: input };
  }

  // ── Health indicators ──
  const healthWords = ['health', 'expiring', 'tokens', 'error', 'rate', 'fehler', 'ablauf', 'gesundheit'];
  if (healthWords.some((w) => lower.includes(w))) {
    return { intent: 'health', original: input };
  }

  // ── Agents ──
  const agentWords = ['agents', 'connected', 'clients', 'nutzer'];
  if (agentWords.some((w) => lower.includes(w))) {
    return { intent: 'agents', original: input };
  }

  // ── Search ──
  const searchWords = ['search', 'find', 'lookup', 'suche', 'finde', 'nach'];
  if (searchWords.some((w) => lower.includes(w))) {
    const slug = extractSlug(tokens);
    return { intent: 'search', slug, query: tokens.join(' '), original: input };
  }

  // Default fallback: try search
  return { intent: 'search', query: input, original: input };
}

/**
 * Format a structured result into natural language for the admin console.
 */
export function formatNLResponse(intent: NLQuery['intent'], data: unknown): string {
  switch (intent) {
    case 'brain_status': {
      const d = data as Record<string, number>;
      return (
        `Brain overview: ${d.pages?.toLocaleString() ?? '—'} pages across ${d.sources ?? '—'} sources, ` +
        `${d.chunks?.toLocaleString() ?? '—'} chunks (${d.embedding_coverage_pct ?? '—'}% embedded), ` +
        `${d.links_current ?? '—'} current links + ${d.links_historical ?? '—'} historical.`
      );
    }
    case 'health': {
      const d = data as { expiring_soon: number; error_rate: string };
      return `Health: ${d.expiring_soon} tokens expiring soon, error rate ${d.error_rate}.`;
    }
    case 'agents': {
      const d = data as Array<Record<string, unknown>>;
      return `Connected agents: ${d.length}.`;
    }
    case 'page_links': {
      const d = data as Array<{ to_slug: string; link_type: string }>;
      if (d.length === 0) return 'No outgoing links found.';
      return `Outgoing links (${d.length}): ${d.map((l) => `${l.to_slug} (${l.link_type})`).join(', ')}.`;
    }
    case 'page_backlinks': {
      const d = data as Array<{ from_slug: string; link_type: string }>;
      if (d.length === 0) return 'No incoming links found.';
      return `Incoming links (${d.length}): ${d.map((l) => `${l.from_slug} (${l.link_type})`).join(', ')}.`;
    }
    case 'search': {
      const d = data as Array<{ slug: string; title: string }>;
      if (d.length === 0) return 'No results found.';
      return `Found ${d.length} result(s): ${d.map((r) => `${r.title} (${r.slug})`).join('; ')}.`;
    }
    default:
      return "I'm not sure how to answer that. Try asking about brain status, pages, links, or search.";
  }
}
