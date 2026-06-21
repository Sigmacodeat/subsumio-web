import { z } from "zod";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { createHandler, apiError } from "@/lib/api-handler";

const emailImportSchema = z.object({
  subject: z.string().min(1, "subject_required"),
  from: z.string().min(1, "from_required"),
  body: z.string().min(1, "body_required"),
  date: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: emailImportSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const pages = await api.brain.listPages({ type: "legal_case", limit: 500 });
      const cases = pages.map((p) => ({ slug: p.slug, title: p.title, ...caseFrontmatter(p) }));

      let matchedCase = cases.find((c) => {
        const caseNum = c.case_number;
        return caseNum && body.subject.toLowerCase().includes(caseNum.toLowerCase());
      });

      if (!matchedCase) {
        matchedCase = cases.find((c) => {
          const clientEmail = c.client_slug ? String(c.client_slug) : "";
          const clientName = c.client_name || "";
          const fromLower = body.from.toLowerCase();
          return (
            (clientEmail && fromLower.includes(clientEmail.toLowerCase())) ||
            (clientName && fromLower.includes(clientName.toLowerCase()))
          );
        });
      }

      if (!matchedCase) {
        matchedCase = cases.find((c) => {
          const oppName = c.opponent_name || "";
          return oppName && body.from.toLowerCase().includes(oppName.toLowerCase());
        });
      }

      if (!matchedCase) {
        return Response.json({
          success: false,
          error: "no_case_match",
          message:
            "Keine passende Akte gefunden. Pr\u00fcfen Sie Betreff (Aktenzeichen) oder Absender.",
          suggestions: cases
            .slice(0, 5)
            .map((c) => ({ slug: c.slug, caseNumber: c.case_number, title: c.title })),
        });
      }

      const existingDocs = (matchedCase.documents || []) as Array<{
        id?: string;
        name?: string;
        notes?: string;
      }>;
      const isDuplicate = existingDocs.some((doc) => {
        const docNotes = doc.notes || "";
        return docNotes.includes(`Von: ${body.from}`) && doc.name === `E-Mail: ${body.subject}`;
      });
      if (isDuplicate) {
        return Response.json({
          success: true,
          duplicate: true,
          matchedCase: {
            slug: matchedCase.slug,
            caseNumber: matchedCase.case_number,
            title: matchedCase.title,
          },
          message: "E-Mail wurde bereits in diese Akte importiert.",
        });
      }

      const documentEntry = {
        id: `doc-${Date.now()}`,
        name: `E-Mail: ${body.subject}`,
        type: "email",
        url: "#email",
        uploadedAt: body.date || new Date().toISOString(),
        notes: `Von: ${body.from}\n\n${body.body.substring(0, 2000)}`,
      };

      await api.brain.updatePage({
        slug: matchedCase.slug,
        frontmatter: {
          documents: [...existingDocs, documentEntry],
        },
      });

      return Response.json({
        success: true,
        matchedCase: {
          slug: matchedCase.slug,
          caseNumber: matchedCase.case_number,
          title: matchedCase.title,
        },
        document: documentEntry,
      });
    } catch (err) {
      console.error("[email-import] failed:", err instanceof Error ? err.message : String(err));
      return apiError("import_failed", "E-Mail-Import fehlgeschlagen", 500);
    }
  }
);
