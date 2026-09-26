/**
 * Caller-supplied tool definitions for `runThink` (native tool use).
 *
 * The web Copilot sends its tool catalogue (name, description, JSON Schema)
 * with `/api/think`; the engine hands the definitions to the model and
 * streams the model's structured calls back — it never executes a tool. The
 * definitions cross the trust boundary as DATA: names come from a strict
 * whitelist pattern, descriptions are sanitized and length-capped, schemas
 * are bounded plain objects. A definition that fails any check is dropped,
 * never repaired.
 */
import type { ChatToolDef } from "../ai/gateway.ts";
import { getProviderCapabilities } from "../ai/capabilities.ts";
import { sanitizePromptInput } from "./sanitize.ts";

export const TOOL_NAME_PATTERN = /^[a-z_]{1,40}$/;
export const MAX_TOOLS = 40;
export const MAX_TOOL_DESCRIPTION_CHARS = 400;
/** Serialized JSON Schema bound per tool — the Copilot's largest is ~1.5 KB. */
export const MAX_TOOL_SCHEMA_BYTES = 8_192;
/** Fallback marker instructions the caller may attach for models without tool use. */
export const MAX_TOOL_FALLBACK_CHARS = 20_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates and normalises caller tool definitions. Unknown shapes, bad
 * names, oversized schemas and duplicates are dropped; at most MAX_TOOLS
 * survive. Descriptions pass the same injection scrub as prompt text.
 */
export function sanitizeClientTools(raw: unknown): ChatToolDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ChatToolDef[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_TOOLS) break;
    if (!isPlainObject(entry)) continue;
    const name = entry.name;
    if (typeof name !== "string" || !TOOL_NAME_PATTERN.test(name) || seen.has(name)) continue;
    const description =
      typeof entry.description === "string"
        ? sanitizePromptInput(entry.description, MAX_TOOL_DESCRIPTION_CHARS).text.trim()
        : "";
    const schemaRaw = entry.inputSchema ?? entry.input_schema;
    const schema: Record<string, unknown> = isPlainObject(schemaRaw)
      ? schemaRaw
      : { type: "object", properties: {} };
    if (schema.type !== undefined && schema.type !== "object") continue;
    if (schema.properties !== undefined && !isPlainObject(schema.properties)) continue;
    let serialized: string;
    try {
      serialized = JSON.stringify(schema);
    } catch {
      continue;
    }
    if (serialized.length > MAX_TOOL_SCHEMA_BYTES) continue;
    seen.add(name);
    out.push({
      name,
      description,
      inputSchema: { type: "object", ...schema },
    });
  }
  return out;
}

/** Whether the answering model can take native tool definitions. */
export function providerSupportsTools(modelStr: string): boolean {
  try {
    return getProviderCapabilities(modelStr).supportsToolCalling;
  } catch {
    // Unknown provider / no chat touchpoint: fail closed to the marker fallback.
    return false;
  }
}

export interface ToolModeInput {
  tools: ChatToolDef[];
  /** "provider:model" the answer will be generated with. */
  modelStr: string;
  /** Tool calls only arrive on the streamed path (gateway.chatStream). */
  streaming: boolean;
  fallbackInstructions?: string;
}

export interface ToolMode {
  /** Tool definitions go to the model; calls come back as structured events. */
  native: boolean;
  /** Tools to hand the gateway (empty when not native). */
  tools: ChatToolDef[];
  /** Marker instructions to append to the system prompt (fallback only). */
  extraInstructions: string;
}

/**
 * Decides between native tool use and the caller's marker fallback. Without
 * tools nothing changes; with tools but no provider support (or no streaming),
 * the caller's fallback instructions are appended so the model can still
 * express actions the old way, and `native` reports false to the caller.
 */
export function resolveToolMode(input: ToolModeInput): ToolMode {
  if (input.tools.length === 0) return { native: false, tools: [], extraInstructions: "" };
  const native = input.streaming && providerSupportsTools(input.modelStr);
  if (native) return { native: true, tools: input.tools, extraInstructions: "" };
  const fallback = input.fallbackInstructions?.trim()
    ? sanitizePromptInput(input.fallbackInstructions, MAX_TOOL_FALLBACK_CHARS).text.trim()
    : "";
  return { native: false, tools: [], extraInstructions: fallback };
}

/** One structured call the model made; forwarded to the caller, never run here. */
export interface ThinkToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Normalises a gateway tool-call event; arguments that are not an object become {}. */
export function toThinkToolCall(event: {
  toolCallId: string;
  toolName: string;
  input: unknown;
}): ThinkToolCall {
  return {
    id: event.toolCallId,
    name: event.toolName,
    args: isPlainObject(event.input) ? event.input : {},
  };
}
