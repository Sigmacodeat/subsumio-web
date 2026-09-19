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
}

type EnginePage = { slug: string; title: string; frontmatter?: Record<string, unknown> };

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
      SOURCES.map((source) =>
        fetch(`${ENGINE_URL}/api/pages?type=${source.type}&limit=100`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null)
      )
    );

    const docs: SignableDoc[] = [];
    for (const [index, res] of responses.entries()) {
      if (!res?.ok) continue;
      const source = SOURCES[index];
      const data = await res.json();
      const pages: EnginePage[] = Array.isArray(data) ? data : (data.pages ?? []);
      for (const page of pages) {
        const fm = page.frontmatter ?? {};
        // Only documents explicitly stamped with THIS matter are shown.
        if (fm.case_slug !== caseSlug) continue;
        const status = String(fm.status ?? "draft");
        if (source.closed.has(status)) continue;
        docs.push({
          slug: page.slug,
          title: page.title,
          document_type: source.type,
          status,
          recipient_name: fm[source.name] as string | undefined,
          recipient_email: fm[source.email] as string | undefined,
          expires_at: fm.expires_at as string | undefined,
          case_slug: caseSlug,
        });
      }
    }

    return apiSuccess({ docs });
  }
);
