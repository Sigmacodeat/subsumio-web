import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  listMemories,
  createMemory,
  createMemoryWithSupersession,
  updateMemory,
  deleteMemory,
  inferMemoriesFromMessage,
  searchMemories,
  type MemoryType,
} from "@/lib/copilot-memory";
import { extractMemoriesWithLLM, isLLMExtractionAvailable } from "@/lib/copilot-memory-llm";

const memoryPostSchema = z.object({
  action: z.enum(["create", "update", "delete", "infer", "search"]).optional(),
  type: z.enum(["preference", "fact", "instruction", "context", "deadline"]).optional(),
  key: z.string().max(200).optional(),
  value: z.string().max(5000).optional(),
  source: z.enum(["user_explicit", "inferred", "system"]).optional(),
  caseSlug: z.string().max(200).optional(),
  pinned: z.boolean().optional(),
  message: z.string().max(5000).optional(),
});

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, query) => {
    const caseSlug = query?.caseSlug;
    const type = query?.type as MemoryType | undefined;
    const pinnedOnly = query?.pinnedOnly === "true";

    try {
      const memories = await listMemories({ caseSlug, type, pinnedOnly });
      return NextResponse.json({ memories });
    } catch (err) {
      console.error(
        "[copilot/memory] GET failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to load memories", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: memoryPostSchema,
    audit: (_ctx, body) => {
      const b = body as {
        action?: string;
        type?: string;
        key?: string;
        source?: string;
        caseSlug?: string;
        pinned?: boolean;
      };
      return {
        action: "copilot.memory_create" as const,
        entityType: "memory",
        details: {
          subAction: b.action,
          type: b.type,
          key: b.key,
          source: b.source,
          caseSlug: b.caseSlug,
          pinned: b.pinned,
        },
      };
    },
  },
  async (ctx, body) => {
    const { action, type, key, value, source, caseSlug, pinned, message } = body as {
      action?: string;
      type?: MemoryType;
      key?: string;
      value?: string;
      source?: "user_explicit" | "inferred" | "system";
      caseSlug?: string;
      pinned?: boolean;
      message?: string;
    };

    try {
      // Infer memories from a user message
      if (action === "infer" && message) {
        // P0.1: Use LLM-based extraction when available, fall back to regex
        let extracted: Array<{
          type: MemoryType;
          key: string;
          value: string;
          entities?: string[];
          validFrom?: string;
          validTo?: string;
        }> = [];

        if (isLLMExtractionAvailable()) {
          const llmResults = await extractMemoriesWithLLM(message, { caseSlug });
          extracted = llmResults.map((r) => ({
            type: r.type,
            key: r.key,
            value: r.value,
            entities: r.entities,
            validFrom: r.validFrom,
            validTo: r.validTo,
          }));
        }

        // Fallback: regex-based inference when LLM is not configured or returns nothing
        if (extracted.length === 0) {
          extracted = inferMemoriesFromMessage(message);
        }

        const created = [];
        const allSuperseded: string[] = [];
        for (const item of extracted) {
          const { memory: mem, superseded } = await createMemoryWithSupersession({
            type: item.type,
            key: item.key,
            value: item.value,
            source: "inferred",
            caseSlug,
            entities: item.entities,
            validFrom: item.validFrom,
            validTo: item.validTo,
          });
          created.push(mem);
          allSuperseded.push(...superseded);
        }
        return NextResponse.json({
          inferred: created,
          superseded: allSuperseded,
          method: isLLMExtractionAvailable() ? "llm" : "regex",
        });
      }

      // Semantic search across memories
      if (action === "search" && message) {
        const results = await searchMemories({ query: message, caseSlug, limit: 10 });
        return NextResponse.json({ results });
      }

      // P2.7: Agent-Generated Facts — store confirmed agent actions as memories
      if (action === "agent_action" && key && value) {
        const { memory, superseded } = await createMemoryWithSupersession({
          type: type ?? "fact",
          key,
          value,
          source: "system",
          caseSlug,
        });
        return NextResponse.json({ memory, superseded });
      }

      // Create a memory entry
      if (action === "create" && type && key && value) {
        const memory = await createMemory({
          type,
          key,
          value,
          source: source ?? "user_explicit",
          caseSlug,
          pinned: pinned ?? false,
        });
        return NextResponse.json({ memory });
      }

      return apiError("bad_request", "Invalid action or missing fields", 400);
    } catch (err) {
      console.error(
        "[copilot/memory] POST failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to create memory", 500);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (_ctx, body) => {
      const b = (body ?? {}) as { id?: string; pinned?: boolean; type?: string };
      return {
        action: "copilot.memory_update" as const,
        entityType: "memory",
        entityId: b.id,
        details: { pinned: b.pinned, type: b.type },
      };
    },
  },
  async (ctx, body) => {
    const { id, value, pinned, type } = (body ?? {}) as {
      id?: string;
      value?: string;
      pinned?: boolean;
      type?: MemoryType;
    };

    if (!id) {
      return apiError("bad_request", "Memory id required", 400);
    }

    try {
      await updateMemory(id, { value, pinned, type });
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(
        "[copilot/memory] PATCH failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to update memory", 500);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (_ctx, body) => {
      const b = (body ?? {}) as { id?: string };
      return {
        action: "copilot.memory_delete" as const,
        entityType: "memory",
        entityId: b.id,
        details: {},
      };
    },
  },
  async (ctx, body) => {
    const { id } = (body ?? {}) as { id?: string };

    if (!id) {
      return apiError("bad_request", "Memory id required", 400);
    }

    try {
      await deleteMemory(id);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(
        "[copilot/memory] DELETE failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to delete memory", 500);
    }
  }
);
