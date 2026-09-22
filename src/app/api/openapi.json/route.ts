import { createPublicHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * WP-7.46: GPT-Actions-kompatible OpenAPI-Spec (Legora/Harvey-Parität).
 * Dokumentiert die per API-Key (Bearer) nutzbaren REST-Endpunkte für
 * externe AI-Clients (ChatGPT Actions, Claude, eigene Agenten).
 * Auth: `Authorization: Bearer <api-key>` — Keys unter
 * Einstellungen → API-Schlüssel. Alternativ MCP am Engine-Endpoint.
 */
export const GET = createPublicHandler({ cors: true, rateLimitMax: 30 }, async (req) => {
  const origin = new URL(req.url).origin;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Subsumio Kanzlei-API",
      version: "1.0.0",
      description:
        "Externe AI-Schnittstelle der Kanzlei: semantische Rechtsrecherche, " +
        "Akten- und Dokumentenzugriff sowie Workflow-Steuerung. " +
        "Alle Antworten sind JSON. Schreibende Aktionen erzeugen " +
        "anwaltlich zu prüfende Ergebnisse.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API-Key" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" }, message: { type: "string" } },
        },
        SearchResult: {
          type: "object",
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            type: { type: "string" },
            snippet: { type: "string" },
            score: { type: "number" },
          },
        },
        Page: {
          type: "object",
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            type: { type: "string" },
            content: { type: "string" },
            frontmatter: { type: "object", additionalProperties: true },
          },
        },
        Workflow: {
          type: "object",
          properties: {
            slug: { type: "string" },
            title: { type: "string" },
            frontmatter: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/search": {
        get: {
          operationId: "searchLegalCorpus",
          summary: "Semantische Suche über Korpus, Akten und Dokumente",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Suchbegriff, Norm oder natürlichsprachliche Frage",
            },
            {
              name: "type",
              in: "query",
              schema: { type: "string" },
              description: "Optionaler Typfilter (z. B. case, judgment, statute)",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 10, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Trefferliste",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SearchResult" },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "API-Key fehlt oder ungültig" },
          },
        },
      },
      "/api/pages": {
        get: {
          operationId: "listPages",
          summary: "Seiten eines Typs auflisten (Akten, Dokumente, Workflows)",
          parameters: [
            {
              name: "type",
              in: "query",
              schema: { type: "string" },
              description: "z. B. case, document, workflow, deadline",
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 50, maximum: 500 },
            },
          ],
          responses: {
            "200": {
              description: "Seitenliste",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      pages: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Page" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/pages/{slug}": {
        get: {
          operationId: "getPage",
          summary: "Eine Seite inkl. Frontmatter laden",
          parameters: [
            {
              name: "slug",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Slug der Seite, z. B. cases/mueller-vs-huber",
            },
          ],
          responses: {
            "200": {
              description: "Seite",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Page" },
                },
              },
            },
            "404": { description: "Seite nicht gefunden" },
          },
        },
      },
      "/api/workflows": {
        get: {
          operationId: "listWorkflows",
          summary: "Laufende Workflows und verfügbare Templates auflisten",
          responses: {
            "200": {
              description: "Workflows und Templates",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      workflows: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Workflow" },
                      },
                      templates: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: "startWorkflow",
          summary: "Workflow aus Template starten (z. B. Due Diligence auf einer Akte)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["template_id"],
                  properties: {
                    template_id: { type: "string" },
                    case_slug: { type: "string" },
                    prompt: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Workflow gestartet" },
            "404": { description: "Template nicht gefunden" },
          },
        },
      },
    },
  };

  return Response.json(spec, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
});
