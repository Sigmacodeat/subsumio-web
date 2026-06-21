import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const types = [
        "legal_case",
        "legal_contact",
        "invoice",
        "deadline",
        "document_draft",
        "signature_request",
        "agent_action",
        "audit_log",
        "judgement",
      ];
      const allPages: Array<Record<string, unknown>> = [];

      for (const type of types) {
        try {
          let offset = 0;
          const perPage = 100;
          let hasMore = true;
          let pagesFetched = 0;
          while (hasMore && pagesFetched < 50) {
            const res = await fetch(
              `${ENGINE_URL}/api/pages?type=${type}&limit=${perPage}&offset=${offset}`,
              {
                headers: ctx.headers,
              }
            );
            if (res.ok) {
              const raw = await res.json();
              const pages = Array.isArray(raw)
                ? raw
                : Array.isArray((raw as Record<string, unknown>)?.pages)
                  ? (raw as Record<string, unknown[]>).pages
                  : [];
              if (pages.length === 0) {
                hasMore = false;
              } else {
                allPages.push(...pages);
                offset += pages.length;
                pagesFetched++;
                if (pages.length < perPage) hasMore = false;
              }
            } else {
              hasMore = false;
            }
          }
        } catch {
          // Einzelne Typen drfen den Export nicht abbrechen
        }
      }

      const exportData = {
        export_metadata: {
          generated_at: new Date().toISOString(),
          user_id: ctx.user.id,
          user_email: ctx.user.email,
          format: "JSON",
          legal_basis: "GDPR Art. 20",
          description: "Structured, commonly used, machine-readable format per GDPR Art. 20",
        },
        data: allPages,
        statistics: {
          total_pages: allPages.length,
          by_type: allPages.reduce((acc: Record<string, number>, p) => {
            const t = String(p.type || "unknown");
            acc[t] = (acc[t] || 0) + 1;
            return acc;
          }, {}),
        },
      };

      return Response.json(exportData);
    } catch (err) {
      console.error("[gdpr-export] failed:", err instanceof Error ? err.message : String(err));
      return apiError("export_failed", "Datenexport fehlgeschlagen", 500);
    }
  }
);
