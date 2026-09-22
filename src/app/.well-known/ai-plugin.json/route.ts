import { createPublicHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * WP-7.46: ChatGPT-Plugin/Actions-Manifest. Verweist auf die
 * OpenAPI-Spec unter /api/openapi.json. Auth via Bearer-API-Key,
 * den die Kanzlei in den Einstellungen erzeugt.
 */
export const GET = createPublicHandler({ cors: true }, async (req) => {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      schema_version: "v1",
      name_for_model: "subsumio",
      name_for_human: "Subsumio Kanzlei",
      description_for_model:
        "Zugriff auf das Kanzlei-System: Rechtsrecherche im Korpus, " +
        "Akten und Dokumente lesen, Workflows starten. Nutze die " +
        "Operationen searchLegalCorpus, listPages, getPage, " +
        "listWorkflows und startWorkflow.",
      description_for_human:
        "Kanzlei-OS: Rechtsrecherche, Akten und Workflows für externe AI-Assistenten.",
      auth: { type: "service_http", authorization_type: "bearer" },
      api: { type: "openapi", url: `${origin}/api/openapi.json` },
      contact_email: "support@subsumio.com",
      legal_info_url: `${origin}/impressum`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
});
