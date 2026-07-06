import { NextResponse } from "next/server";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  inferMemoriesFromMessage,
  type MemoryType,
} from "@/lib/copilot-memory";

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
  },
  async (ctx, body) => {
    const { action, type, key, value, source, caseSlug, pinned, message } = (body ?? {}) as {
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
        const inferred = inferMemoriesFromMessage(message);
        const created = [];
        for (const item of inferred) {
          const mem = await createMemory({
            type: item.type,
            key: item.key,
            value: item.value,
            source: "inferred",
            caseSlug,
          });
          created.push(mem);
        }
        return NextResponse.json({ inferred: created });
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
