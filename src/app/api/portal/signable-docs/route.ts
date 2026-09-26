import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { createPublicHandler, apiSuccess } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";
import { listEnginePages } from "@/lib/engine-pages";
import { isPortalSignable } from "@/lib/portal-view";
import { signedDocumentHash } from "@/lib/signed-document-hash";

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
  /** SHA-256 of `content`; sent back on signing so the signature binds this text. */
  content_hash?: string;
}

// This route asks for a type firm-wide and only filters to this matter
// afterwards — a single capped call meant a matter whose signature/POA docs
// fell outside the newest page (a firm with many other matters' open
// signatures, or older requests) silently disappeared from the client's
// portal with no error. listEnginePages already pages through the full
// firm-wide list (bounded, batched at the engine's own per-request cap) and
// — unlike the hand-rolled loop this replaced — filters out tombstoned
// pages, so a deleted signature request can no longer resurface here.
const MAX_DOCS_PER_TYPE = 1_000; // outstanding docs of one type, firm-wide

const SOURCES = [
  {
    type: "signature_request" as const,
    name: "recipient_name",
    email: "recipient_email",
  },
  {
    type: "power_of_attorney" as const,
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
      SOURCES.map((source) => listEnginePages(headers, source.type, MAX_DOCS_PER_TYPE))
    );

    const matched: {
      source: (typeof SOURCES)[number];
      page: { slug: string; title: string; frontmatter?: Record<string, unknown> };
      status: string;
    }[] = [];
    for (const [index, pages] of responses.entries()) {
      const source = SOURCES[index];
      for (const page of pages) {
        const fm = page.frontmatter ?? {};
        // Only documents explicitly stamped with THIS matter are shown.
        if (fm.case_slug !== caseSlug) continue;
        // Only requests the firm sent — never drafts, closed requests or
        // tracking rows whose document lives elsewhere.
        if (!isPortalSignable(fm)) continue;
        const status = String(fm.status);
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
          content_hash: full ? signedDocumentHash(full.content) : undefined,
        };
        return doc;
      })
    );

    return apiSuccess({ docs: withContent });
  }
);
