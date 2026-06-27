import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import {
  buildSourceRegistry,
  loadSyncStatus,
  saveSyncStatus,
  type SourceRegistryResponse,
} from "@/lib/source-registry";

export const maxDuration = 30;

const sourcesQuerySchema = z.object({
  jurisdiction: z.enum(["DE", "AT", "CH", "EU", "ALL"]).optional(),
  type: z.enum(["statute_corpus", "judgement_api", "regulatory_feed", "commercial"]).optional(),
  status: z.enum(["fresh", "stale", "syncing", "error", "unknown"]).optional(),
});

export const GET = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    query: sourcesQuerySchema,
    cacheMaxAge: 60,
    audit: (_ctx, _body, query) => ({
      action: "legal.sources_list" as const,
      entityType: "source_registry",
      details: {
        jurisdiction: query.jurisdiction,
        type: query.type,
        status: query.status,
      },
    }),
  },
  async (ctx, _body, query, _req) => {
    const syncStatus = await loadSyncStatus(ENGINE_URL, engineHeadersForBrain(ctx.brainId));
    const registry = await buildSourceRegistry(syncStatus);

    let sources = registry.sources;
    if (query.jurisdiction) {
      sources = sources.filter((s) => s.jurisdiction === query.jurisdiction);
    }
    if (query.type) {
      sources = sources.filter((s) => s.type === query.type);
    }
    if (query.status) {
      sources = sources.filter((s) => s.status === query.status);
    }

    const response: SourceRegistryResponse = {
      ...registry,
      sources,
      total: sources.length,
      fresh: sources.filter((s) => s.status === "fresh").length,
      stale: sources.filter((s) => s.status === "stale").length,
      error: sources.filter((s) => s.status === "error").length,
      unknown: sources.filter((s) => s.status === "unknown").length,
    };

    return Response.json(response);
  }
);

const refreshSchema = z.object({
  source_id: z.string().min(1),
});

export const POST = createHandler(
  {
    action: "legal.judgements",
    rateTier: "standard",
    body: refreshSchema,
    audit: (ctx, body) => ({
      action: "legal.sources_refresh" as const,
      entityType: "source_registry",
      details: { source_id: body.source_id },
    }),
  },
  async (ctx, body, _query, _req) => {
    const syncStatus = await loadSyncStatus(ENGINE_URL, engineHeadersForBrain(ctx.brainId));
    const registry = await buildSourceRegistry(syncStatus);
    const source = registry.sources.find((s) => s.id === body.source_id);

    if (!source) {
      return Response.json(
        { error: "source_not_found", message: `Quelle '${body.source_id}' nicht gefunden.` },
        { status: 404 }
      );
    }

    if (source.type === "judgement_api") {
      const startTime = Date.now();
      try {
        const res = await fetch(`${ENGINE_URL}/api/legal/judgements-sync`, {
          method: "POST",
          headers: { ...engineHeadersForBrain(ctx.brainId), "Content-Type": "application/json" },
          body: JSON.stringify({
            jurisdiction: source.jurisdiction.toLowerCase(),
            limit: 50,
          signal: AbortSignal.timeout(30_000),
          }),
        });

        if (!res.ok) {
          throw new Error(`Engine returned ${res.status}`);
        }

        const result = (await res.json()) as {
          fetched?: number;
          imported?: number;
          errors?: string[];
        };
        const duration_ms = Date.now() - startTime;
        const now = new Date().toISOString();

        syncStatus[source.id] = {
          last_sync_at: now,
          last_error: undefined,
        };
        await saveSyncStatus(ENGINE_URL, engineHeadersForBrain(ctx.brainId), syncStatus);

        return Response.json({
          success: true,
          source_id: source.id,
          label: source.label,
          sync_summary: {
            fetched: result.fetched ?? 0,
            imported: result.imported ?? 0,
            errors: result.errors ?? [],
            duration_ms,
            timestamp: now,
          },
        });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "unknown";
        syncStatus[source.id] = {
          last_sync_at: new Date().toISOString(),
          last_error: errorMsg,
        };
        await saveSyncStatus(ENGINE_URL, engineHeadersForBrain(ctx.brainId), syncStatus);

        return Response.json({ error: "sync_failed", source_id: source.id }, { status: 502 });
      }
    }

    if (source.type === "statute_corpus") {
      const now = new Date().toISOString();
      syncStatus[source.id] = {
        last_sync_at: now,
        last_error: undefined,
      };
      await saveSyncStatus(ENGINE_URL, engineHeadersForBrain(ctx.brainId), syncStatus);

      return Response.json({
        success: true,
        source_id: source.id,
        label: source.label,
        sync_summary: {
          fetched: source.document_count,
          imported: source.document_count,
          errors: [],
          duration_ms: 0,
          timestamp: now,
        },
      });
    }

    return Response.json(
      {
        error: "unsupported_source_type",
        message: `Sync für Typ '${source.type}' nicht unterstützt.`,
      },
      { status: 400 }
    );
  }
);
