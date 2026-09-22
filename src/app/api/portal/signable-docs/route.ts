import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { createPublicHandler, apiSuccess } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";

const querySchema = z.object({
  token: z.string().min(1, "token_required"),
});

interface SignableDoc {
  slug: string;
  title: string;
  document_type: "signature_request" | "power_of_attorney";
  status: string;
  recipient_name?: string;
  recipient_email?: string;
  expires_at?: string;
  case_slug: string;
  /** Full document text, so the client can read what they're signing — not
   * every request has one: some are still metadata-only (external provider,
   * legacy requests). */
  content?: string;
}

type EnginePage = { slug: string; title: string; frontmatter?: Record<string, unknown> };

// The engine caps a single /api/pages call at 200 rows and sorts by
// updated_desc (server/src/commands/web-api.ts). This route asks for a type
// firm-wide and only filters to this matter afterwards — with a single
// uncapped call, a matter whose signature/POA docs happen to fall outside
// the newest 100 (a firm with many other matters' open signatures, or older
// requests) silently disappeared from the client's portal with no error.
// Page through the full firm-wide list instead, bounded so one portal
// request can't run away.
const ENGINE_PAGE_LIMIT = 200;
const MAX_PAGES_PER_TYPE = 5; // 1,000 outstanding docs of one type, firm-wide

async function fetchAllPagesOfType(
  type: string,
  headers: Record<string, string>
): Promise<EnginePage[]> {
  const all: EnginePage[] = [];
  for (let page = 0; page < MAX_PAGES_PER_TYPE; page++) {
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=${type}&limit=${ENGINE_PAGE_LIMIT}&offset=${page * ENGINE_PAGE_LIMIT}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    ).catch(() => null);
    if (!res?.ok) break;
    const data = await res.json();
    const pages: EnginePage[] = Array.isArray(data) ? data : (data.pages ?? []);
    all.push(...pages);
    if (pages.length < ENGINE_PAGE_LIMIT) break; // reached the end of the list
  }
  return all;
}

const SOURCES = [
  {
    type: "signature_request" as const,
    closed: new Set(["signed", "declined", "expired"]),
    name: "recipient_name",
    email: "recipient_email",
  },
  {
    type: "power_of_attorney" as const,
    closed: new Set(["signed", "expired", "revoked"]),
    name: "client_name",
    email: "client_email",
  },
];

export const GET = createPublicHandler(
  {
    query: querySchema,
    cors: true,
    rateLimitKey: (req) => `portal-signable:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;
    const { headers, caseSlug } = access;

    const responses = await Promise.all(
      SOURCES.map((source) => fetchAllPagesOfType(source.type, headers))
    );

    const matched: { source: (typeof SOURCES)[number]; page: EnginePage; status: string }[] = [];
    for (const [index, pages] of responses.entries()) {
      const source = SOURCES[index];
      for (const page of pages) {
        const fm = page.frontmatter ?? {};
        // Only documents explicitly stamped with THIS matter are shown.
        if (fm.case_slug !== caseSlug) continue;
        const status = String(fm.status ?? "draft");
        if (source.closed.has(status)) continue;
        matched.push({ source, page, status });
      }
    }

    // The list call above never returns body text (engine list endpoint
    // hard-codes content: ""). Fetch it per matched, still-open document so
    // the client can read what they're actually signing — an NDA's whole
    // point is the text, not just a title. Small N in practice: a matter
    // rarely has more than a handful of documents open for signature.
    const withContent = await Promise.all(
      matched.map(async ({ source, page, status }) => {
        const fm = page.frontmatter ?? {};
        const full = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(page.slug)}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const doc: SignableDoc = {
          slug: page.slug,
          title: page.title,
          document_type: source.type,
          status,
          recipient_name: fm[source.name] as string | undefined,
          recipient_email: fm[source.email] as string | undefined,
          expires_at: fm.expires_at as string | undefined,
          case_slug: caseSlug,
          content: typeof full?.content === "string" ? full.content : undefined,
        };
        return doc;
      })
    );

    return apiSuccess({ docs: withContent });
  }
);
