import { z } from "zod";
import { createPublicHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { verifyPortalToken } from "@/lib/portal-token";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL } from "@/lib/engine";

const querySchema = z.object({
  token: z.string().min(1, "token_required"),
});

interface SignableDoc {
  slug: string;
  title: string;
  document_type: "signature_request" | "power_of_attorney" | "legal_document";
  status: string;
  recipient_name?: string;
  recipient_email?: string;
  expires_at?: string;
  case_slug?: string;
}

export const GET = createPublicHandler(
  {
    query: querySchema,
    cors: true,
    rateLimitKey: (req) => `portal-signable:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    const payload = await verifyPortalToken(query.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }

    const caseSlug = payload.case_slug;

    // Fetch signature requests + powers of attorney for this case
    const [sigRes, poaRes] = await Promise.all([
      fetch(`${ENGINE_URL}/api/pages?type=signature_request&limit=100`, {
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null),
      fetch(`${ENGINE_URL}/api/pages?type=power_of_attorney&limit=100`, {
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null),
    ]);

    const docs: SignableDoc[] = [];

    if (sigRes?.ok) {
      const sigData = await sigRes.json();
      const sigPages: Array<{
        slug: string;
        title: string;
        frontmatter: Record<string, unknown>;
      }> = Array.isArray(sigData) ? sigData : (sigData.pages ?? []);
      for (const p of sigPages) {
        const fm = p.frontmatter;
        const docCaseSlug = fm.case_slug as string | undefined;
        if (docCaseSlug && docCaseSlug !== caseSlug) continue;
        const status = String(fm.status ?? "draft");
        if (status === "signed" || status === "declined" || status === "expired") continue;
        docs.push({
          slug: p.slug,
          title: p.title,
          document_type: "signature_request",
          status,
          recipient_name: fm.recipient_name as string | undefined,
          recipient_email: fm.recipient_email as string | undefined,
          expires_at: fm.expires_at as string | undefined,
          case_slug: docCaseSlug,
        });
      }
    }

    if (poaRes?.ok) {
      const poaData = await poaRes.json();
      const poaPages: Array<{
        slug: string;
        title: string;
        frontmatter: Record<string, unknown>;
      }> = Array.isArray(poaData) ? poaData : (poaData.pages ?? []);
      for (const p of poaPages) {
        const fm = p.frontmatter;
        const docCaseSlug = fm.case_slug as string | undefined;
        if (docCaseSlug && docCaseSlug !== caseSlug) continue;
        const status = String(fm.status ?? "draft");
        if (status === "signed" || status === "expired" || status === "revoked") continue;
        docs.push({
          slug: p.slug,
          title: p.title,
          document_type: "power_of_attorney",
          status,
          recipient_name: fm.client_name as string | undefined,
          recipient_email: fm.client_email as string | undefined,
          expires_at: fm.expires_at as string | undefined,
          case_slug: docCaseSlug,
        });
      }
    }

    return apiSuccess({ docs });
  }
);
