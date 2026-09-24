import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { createPublicHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { listEnginePages } from "@/lib/engine-pages";
import { resolvePortalAccess } from "@/lib/portal-access";
import { generateEpcQrCode } from "@/lib/e-invoice/qr-bill";

export const dynamic = "force-dynamic";

const querySchema = z.object({ token: z.string().min(1, "token_required") });

interface InvoiceFm {
  invoice_number?: string;
  case_slugs?: string[];
  status?: string;
  date?: string;
  due_date?: string;
  total?: number;
  bank?: { iban?: string; bic?: string; name?: string };
}

/**
 * Rechnungen der Akte für das Mandantenportal — nur versendete/offene/
 * bezahlte, keine Entwürfe oder stornierte. Inklusive EPC-QR (GiroCode)
 * als Data-URL, damit der Mandant direkt per Banking-App zahlen kann.
 */
export const GET = createPublicHandler(
  {
    query: querySchema,
    cors: true,
    rateLimitKey: (req) => `portal-invoices:${clientIp(req.headers)}`,
    rateLimitMax: 30,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    // resolvePortalAccess, not a bare token check: disabling the portal or
    // archiving the matter must cut invoice access on the next request.
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;

    const pages = await listEnginePages(access.headers, "invoice", 1000).catch(() => null);
    if (!pages) return apiError("engine_error", "Rechnungen konnten nicht geladen werden", 502);

    const invoices = [];
    for (const p of pages) {
      const fm = (p.frontmatter ?? {}) as InvoiceFm;
      if (!Array.isArray(fm.case_slugs) || !fm.case_slugs.includes(access.caseSlug)) continue;
      if (!fm.status || !["sent", "overdue", "paid"].includes(fm.status)) continue;
      const open = fm.status !== "paid" && fm.total && fm.total > 0;

      let epcQr: string | undefined;
      if (open && fm.bank?.iban) {
        try {
          epcQr = await generateEpcQrCode({
            iban: fm.bank.iban,
            bic: fm.bank.bic,
            name: fm.bank.name ?? "Kanzlei",
            amount: fm.total!,
            remittanceInfo: `Rechnung ${fm.invoice_number ?? ""}`.trim(),
          });
        } catch {
          // QR ist Komfort — ohne ihn bleibt die Rechnung trotzdem sichtbar.
        }
      }

      invoices.push({
        slug: p.slug,
        invoice_number: fm.invoice_number ?? "",
        status: fm.status,
        date: fm.date,
        due_date: fm.due_date,
        total: fm.total ?? 0,
        epc_qr: epcQr,
      });
    }
    invoices.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return apiSuccess({ invoices });
  }
);
