/**
 * Subagent LLM-loop handler (v0.15).
 *
 * Runs one Anthropic Messages API conversation with tool use. The loop is
 * crash-resumable: subagent_messages + subagent_tool_executions together
 * are the single source of truth about where the conversation is. On
 * resume after a worker kill, we load all committed rows, trust any tool
 * execution marked 'complete' or 'failed', and re-run 'pending' ones only
 * for idempotent tools.
 *
 * Safety rails:
 *   - rate leases around every LLM call (acquire → call → release). Mid-
 *     call renewal with backoff. Persistent renewal failure aborts as a
 *     renewable error so the worker re-claims.
 *   - dual-signal abort wiring (ctx.signal + ctx.shutdownSignal) drains
 *     the in-flight call and commits whatever turns are already persisted.
 *   - Anthropic prompt cache markers on system + tools blocks.
 *   - token rollup via ctx.updateTokens per turn.
 *
 * NOT in v0.15: refusal detection, stop_reason=max_tokens partial
 * recovery, parallel tool-use dispatch (runs tools sequentially; the
 * Messages API allows parallel tool_use blocks and the replay tolerates
 * them, but v1 dispatches serially for simplicity). All three are tracked
 * as P2 items in the plan file.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MinionJobContext, MinionJob } from "../types.ts";
import { UnrecoverableError } from "../types.ts";
import { reserveBudget } from "../budget-tracker.ts";
import type {
  ContentBlock,
  SubagentHandlerData,
  SubagentResult,
  SubagentStopReason,
  ToolDef,
} from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import type { GBrainConfig } from "../../config.ts";
import { loadConfig } from "../../config.ts";
import { buildBrainTools, filterAllowedTools } from "../tools/brain-allowlist.ts";
import { acquireLease, releaseLease, renewLeaseWithBackoff } from "../rate-leases.ts";
import { logSubagentSubmission, logSubagentHeartbeat } from "./subagent-audit.ts";
import { resolveModel, isAnthropicProvider, TIER_DEFAULTS } from "../../model-config.ts";
import { buildSystemPrompt, DEFAULT_SUBAGENT_SYSTEM } from "../system-prompt.ts";
import { toolLoop as gatewayToolLoop, sanitizeForJson } from "../../ai/gateway.ts";
import type {
  ChatToolDef,
  ChatMessage,
  ChatBlock,
  ChatResult,
  ToolHandler,
} from "../../ai/gateway.ts";
import { classifyCapabilities } from "../../ai/capabilities.ts";
import { randomUUIDv7 } from "bun";
import { resolveSpecialist } from "../specialist-defs.ts";

// ── Defaults ────────────────────────────────────────────────

const DEFAULT_MODEL = TIER_DEFAULTS.subagent;
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_RATE_KEY = "anthropic:messages";

/**
 * Resolve the rate-lease cap from the env var.
 *
 *   undefined       → 32 (default; was 8 pre-v0.41, starved 10-concurrency batches)
 *   "unlimited"     → POSITIVE_INFINITY (Azure / Bedrock / self-hosted with no upstream cap)
 *   "none"          → POSITIVE_INFINITY (alias)
 *   positive number → that number
 *   anything else   → throws (NaN / "0" / negative / typo — fail loud, NOT silent uncap)
 *
 * Codex pass-1 #7 caught the original `=0` and `NaN` silently uncapping;
 * "0 means disabled" is the universal convention, so we use an explicit
 * `unlimited` sentinel instead. Misconfig fails at startup with a hint.
 */
export function resolveLeaseCap(raw: string | undefined): number {
  if (raw === undefined) return 32;
  if (raw === "unlimited" || raw === "none") return Number.POSITIVE_INFINITY;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  throw new Error(
    `GBRAIN_ANTHROPIC_MAX_INFLIGHT="${raw}" is invalid. ` +
      `Use a positive integer, "unlimited" (or "none"), or omit for default 32.`
  );
}
const DEFAULT_MAX_CONCURRENT = resolveLeaseCap(process.env.GBRAIN_ANTHROPIC_MAX_INFLIGHT);
const DEFAULT_LEASE_TTL_MS = 120_000;
// v0.41 Approach C: DEFAULT_SUBAGENT_SYSTEM lives in ./system-prompt.ts
// so the renderer and the handler share one source of truth. Kept as
// a re-export alias here for back-compat with any external importer.
const DEFAULT_SYSTEM = DEFAULT_SUBAGENT_SYSTEM;

// ── Injectable surfaces (for tests) ─────────────────────────

/**
 * Anthropic Messages client. The real Anthropic SDK implements this
 * structurally; tests can substitute a mock without the SDK import.
 */
export interface MessagesClient {
  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    opts?: { signal?: AbortSignal }
  ): Promise<Anthropic.Message>;
}

export interface SubagentDeps {
  /** Engine for DB-backed ops (tools + message persistence + rate leases). */
  engine: BrainEngine;
  /** Anthropic client. Defaults to the SDK-constructed client. */
  client?: MessagesClient;
  /**
   * Anthropic SDK constructor. Defaults to `() => new Anthropic()`.
   * Overridable in tests so the factory default-client branch is
   * exercisable without an ANTHROPIC_API_KEY or a real API call.
   * When `deps.client` is provided, this is unused.
   */
  makeAnthropic?: () => Anthropic;
  /** Config (MCP, brain, etc.). Defaults to loadConfig(). */
  config?: GBrainConfig;
  /** Rate-lease key. Defaults to `anthropic:messages`. */
  rateLeaseKey?: string;
  /** Max concurrent inflight calls on that key. Defaults to GBRAIN_ANTHROPIC_MAX_INFLIGHT or 8. */
  maxConcurrent?: number;
  /** Lease TTL. Defaults to 120s. */
  leaseTtlMs?: number;
  /**
   * Override tool registry. When omitted, buildBrainTools is called with
   * the caller's subagentId at dispatch time.
   */
  toolRegistry?: ToolDef[];
}

// ── Types for internal state ────────────────────────────────

interface PersistedMessage {
  message_idx: number;
  role: "user" | "assistant";
  content_blocks: ContentBlock[];
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_cache_read: number | null;
  tokens_cache_create: number | null;
  model: string | null;
}

interface PersistedToolExec {
  message_idx: number;
  tool_use_id: string;
  tool_name: string;
  input: unknown;
  status: "pending" | "complete" | "failed";
  output: unknown;
  error: string | null;
}

// ── Public handler factory ──────────────────────────────────

/**
 * Build a subagent handler bound to a specific engine. `registerBuiltin
 * Handlers` wires this up as `worker.register('subagent', handler)` at
 * worker startup. Always registered — `ANTHROPIC_API_KEY` is the natural
 * cost gate and `PROTECTED_JOB_NAMES` gates submission.
 */
export function makeSubagentHandler(deps: SubagentDeps) {
  const engine = deps.engine;
  // sdk.messages IS the MessagesClient-shaped object. The v0.16.0 bug was
  // casting new Anthropic() (top level) to MessagesClient, but .create()
  // lives at sdk.messages.create. Assigning sdk.messages directly gets the
  // right object; JS method-call semantics preserve `this` at the call
  // site (subagent.ts invokes client.create(...) with client === sdk.messages).
  const makeAnthropic = deps.makeAnthropic ?? (() => new Anthropic());
  const client: MessagesClient = deps.client ?? makeAnthropic().messages;
  const config = deps.config ?? loadConfig() ?? ({ engine: "postgres" } as GBrainConfig);
  const rateLeaseKey = deps.rateLeaseKey ?? DEFAULT_RATE_KEY;
  const maxConcurrent = deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const leaseTtlMs = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;

  return async function subagentHandler(ctx: MinionJobContext): Promise<SubagentResult> {
    const data = (ctx.data ?? {}) as unknown as SubagentHandlerData;
    if (!data.prompt || typeof data.prompt !== "string") {
      throw new Error("subagent job data.prompt is required (string)");
    }

    // v0.43 — Specialist subagent definition resolution.
    // If data.subagent_def is set, load the embedded (or plugin) definition
    // and overlay system prompt, allowed_tools, max_turns, and model.
    if (data.subagent_def) {
      const def = resolveSpecialist(data.subagent_def);
      if (def) {
        data.system = def.systemPrompt;
        if (!data.allowed_tools && def.allowedTools && def.allowedTools.length > 0) {
          data.allowed_tools = def.allowedTools;
        }
        if (def.maxTurns != null) {
          data.max_turns = def.maxTurns;
        }
        if (def.model) {
          data.model = def.model;
        } else if (def.modelTier) {
          // Per-specialist config override: models.specialist.<name>
          // Takes precedence over tier defaults — enables hybrid routing
          // where individual specialists use different providers.
          // e.g. gbrain config set models.specialist.law-matcher cohere:command-r-plus-08-2024
          const specialistKey = `models.specialist.${def.name}`;
          const specialistModel = engine ? await engine.getConfig(specialistKey) : null;
          if (specialistModel && specialistModel.trim()) {
            data.model = await resolveModel(engine, {
              tier: def.modelTier,
              configKey: specialistKey,
              fallback: TIER_DEFAULTS[def.modelTier],
            });
          } else {
            // Tier-based config chain — allows users to override per-tier
            // (e.g. models.tier.utility = deepseek:deepseek-chat)
            const tierModel = await resolveModel(engine, {
              tier: def.modelTier,
              configKey: `models.tier.${def.modelTier}`,
              fallback: TIER_DEFAULTS[def.modelTier],
            });
            data.model = tierModel;
          }
        }
      }
      // Silently ignore unknown definitions so the handler falls back to
      // the generic subagent behavior — this avoids breaking replay of old
      // jobs if a definition is later renamed.
    }

    // v0.38 (S1.5 + S1.7) — capability-based gate replaces the v0.31.12
    // Anthropic-only check. The handler now routes between two paths:
    //   1. Gateway path (gateway.toolLoop, provider-agnostic) — opt in via
    //      `gbrain config set agent.use_gateway_loop true`
    //   2. Legacy Anthropic-direct path (existing code below)
    // Default is the legacy path so v0.38 patch releases ship the same
    // behavior as v0.37. Users dogfood the gateway path by flipping the flag.
    //
    // Refuse-at-handler-entry when the model literally lacks tool calling
    // OR is from an unknown provider. The queue.ts gate already catches this
    // for queue-submitted jobs; the check here covers direct `gbrain agent run`
    // invocations and any code path that bypasses the queue's capability check.
    if (data.model) {
      const verdict = classifyCapabilities(data.model);
      if (verdict === "unusable:no_tools") {
        throw new Error(
          `subagent job rejected: data.model "${data.model}" lacks native tool calling. ` +
            `The subagent loop dispatches brain ops via tool calls — without tool support the loop has no way to run.`
        );
      }
      if (verdict === "unknown") {
        throw new Error(
          `subagent job rejected: data.model "${data.model}" references an unknown provider. ` +
            `Use format provider:model where provider matches a recipe in src/core/ai/recipes/.`
        );
      }
    }
    const model =
      data.model ??
      (await resolveModel(engine, {
        tier: "subagent",
        configKey: "models.subagent",
        fallback: TIER_DEFAULTS.subagent,
      }));
    const maxTurns = data.max_turns ?? DEFAULT_MAX_TURNS;
    // v0.41 Approach C: systemPrompt is now built AFTER toolDefs (a few
    // lines below) so the renderer can splice a tool-usage preamble
    // listing each available tool's usage_hint. The renderer is
    // deterministic so the Anthropic prompt-cache marker on the system
    // block stays a hit across turns.

    // v0.38 S1.10 — feature flag for the gateway-native tool loop. When ON,
    // route ALL subagent jobs through gateway.toolLoop() (works for every
    // provider in src/core/ai/recipes/). When OFF, route through the legacy
    // Anthropic-direct path AND refuse non-Anthropic models loudly.
    const useGatewayLoopRaw = await engine.getConfig("agent.use_gateway_loop").catch(() => null);
    const useGatewayLoop =
      typeof useGatewayLoopRaw === "string" &&
      (useGatewayLoopRaw === "true" || useGatewayLoopRaw === "1");
    if (!useGatewayLoop && !isAnthropicProvider(model)) {
      throw new Error(
        `subagent job: resolved model "${model}" is non-Anthropic but agent.use_gateway_loop is not enabled. ` +
          `Enable the gateway-native loop to run on this provider: ` +
          `\`gbrain config set agent.use_gateway_loop true\`. ` +
          `Or use an Anthropic model (e.g. anthropic:claude-sonnet-4-6).`
      );
    }

    // Build the tool registry bound to THIS job as the owning subagent.
    // brain_id (per-call brain override; children inherit parent's unless
    // they set their own) and allowed_slug_prefixes (v0.23 trusted-workspace
    // allow-list — flows through buildBrainTools → the put_page schema
    // description AND the OperationContext, so the model's tool schema and
    // the server-side check stay in sync).
    const registry =
      deps.toolRegistry ??
      buildBrainTools({
        subagentId: ctx.id,
        engine,
        config,
        brainId: data.brain_id,
        allowedSlugPrefixes: data.allowed_slug_prefixes,
        // v0.43 multi-tenant: tenant jobs (web-api stamp, supervisor-propagated)
        // scope every brain tool to the tenant's source.
        sourceId:
          typeof data._source_id === "string" && data._source_id ? data._source_id : undefined,
        // Federated READ sources (law corpus) scoped by jurisdiction.
        // Threaded into ctx.auth.allowedSources for sourceScopeOpts().
        sourceIds:
          Array.isArray(data._source_ids) && data._source_ids.length > 0
            ? data._source_ids
            : undefined,
      });
    const toolDefs =
      data.allowed_tools && data.allowed_tools.length > 0
        ? filterAllowedTools(registry, data.allowed_tools)
        : registry;

    // v0.41 Approach C: render the final system prompt now that toolDefs
    // is known. Splices a deterministic tool-usage preamble listing each
    // tool's usage_hint. Caller can opt out via data.system_no_tool_preamble.
    const systemPrompt = buildSystemPrompt(toolDefs, data.system, {
      no_tool_preamble: data.system_no_tool_preamble,
    });

    // v0.42.38.0+ — Pass cached_context separately so the gateway can split
    // it into a 2nd cache breakpoint (base system + context). Previously
    // concatenated into one string, which meant changing context invalidated
    // the base system cache. Now the base system stays cached across layers.
    const cachedContext = data.cached_context
      ? "## KONTEXT (aus vorherigen Layern)\n" + String(data.cached_context)
      : undefined;

    logSubagentSubmission({
      caller: "worker",
      remote: true,
      job_id: ctx.id,
      model,
      tools_count: toolDefs.length,
      allowed_tools: toolDefs.map((t) => t.name),
    });

    // v0.42.38.0+ — extract modelTier + maxOutputTokens from specialist def.
    // Shared by both gateway and legacy paths.
    const tierDef = data.subagent_def ? resolveSpecialist(data.subagent_def) : null;
    const modelTier = tierDef?.modelTier;
    const maxOutputTokens = tierDef?.maxOutputTokens;

    // v0.38 S1.5 — gateway path. Route here when the feature flag is on.
    if (useGatewayLoop) {
      return await runSubagentViaGateway({
        engine,
        ctx,
        data,
        model,
        systemPrompt,
        cachedContext,
        toolDefs,
        maxTurns,
        modelTier,
        maxOutputTokens,
      });
    }

    // ── Load prior state (replay) ───────────────────────────
    const priorMessages = await loadPriorMessages(engine, ctx.id);
    const priorTools = await loadPriorTools(engine, ctx.id);
    const priorToolByUseId = new Map(priorTools.map((t) => [t.tool_use_id, t]));

    // Rebuild the Anthropic messages array from persisted rows.
    const anthroMessages: Anthropic.MessageParam[] =
      priorMessages.length > 0
        ? priorMessages.map((m) => ({ role: m.role, content: m.content_blocks as any }))
        : [{ role: "user", content: data.prompt }];

    // If we had no prior messages, persist the seed user message.
    let nextMessageIdx = priorMessages.length;
    if (priorMessages.length === 0) {
      await persistMessage(engine, ctx.id, {
        message_idx: 0,
        role: "user",
        content_blocks: [{ type: "text", text: data.prompt }],
        tokens_in: null,
        tokens_out: null,
        tokens_cache_read: null,
        tokens_cache_create: null,
        model: null,
      });
      nextMessageIdx = 1;
    }

    // Token rollup.
    const tokenTotals = { in: 0, out: 0, cache_read: 0, cache_create: 0 };
    for (const m of priorMessages) {
      if (m.tokens_in) tokenTotals.in += m.tokens_in;
      if (m.tokens_out) tokenTotals.out += m.tokens_out;
      if (m.tokens_cache_read) tokenTotals.cache_read += m.tokens_cache_read;
      if (m.tokens_cache_create) tokenTotals.cache_create += m.tokens_cache_create;
    }

    // Count assistant messages already persisted toward max_turns.
    let assistantTurns = priorMessages.filter((m) => m.role === "assistant").length;

    // ── Replay reconciliation ───────────────────────────────
    //
    // If the last persisted message is an assistant with tool_use blocks
    // AND no subsequent user message has been synthesized yet, we crashed
    // mid-tool-dispatch. Finish those tools now so the next LLM call sees
    // a consistent conversation.
    //
    // v0.37.7.0 #1151: if the last persisted message is an assistant
    // with NO tool_use blocks, the prior run already reached terminal
    // end_turn. Sonnet 4.6+ rejects assistant-prefill, so calling
    // messages.create here would dead-letter the job despite the work
    // being already committed. Return immediately with the persisted
    // text as finalText. Mirrors the live-loop terminal logic below.
    const last = priorMessages[priorMessages.length - 1];
    if (last && last.role === "assistant") {
      const pendingToolUses = last.content_blocks.filter(
        (
          b
        ): b is { type: "tool_use"; id: string; name: string; input: unknown } & Record<
          string,
          unknown
        > => b.type === "tool_use"
      );
      if (pendingToolUses.length === 0) {
        const finalText = last.content_blocks
          .filter(
            (b): b is { type: "text"; text: string } & Record<string, unknown> =>
              b.type === "text" && typeof (b as { text?: unknown }).text === "string"
          )
          .map((b) => b.text)
          .join("\n");
        return {
          result: finalText,
          turns_count: assistantTurns,
          stop_reason: "end_turn",
          tokens: tokenTotals,
        };
      }
      if (pendingToolUses.length > 0) {
        const synthesizedResults: ContentBlock[] = [];
        for (const use of pendingToolUses) {
          const prior = priorToolByUseId.get(use.id);
          if (prior?.status === "complete") {
            synthesizedResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: asStringIfNotObject(prior.output),
            } as ContentBlock);
            continue;
          }
          if (prior?.status === "failed") {
            synthesizedResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: prior.error ?? "tool failed",
              is_error: true,
            } as ContentBlock);
            continue;
          }
          // pending or no row yet — try to dispatch.
          const toolDef = toolDefs.find((t) => t.name === use.name);
          if (!toolDef) {
            await persistToolExecFailed(
              engine,
              ctx.id,
              last.message_idx,
              use.id,
              use.name,
              use.input,
              `tool "${use.name}" is not in the registry for this subagent`
            );
            synthesizedResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: `tool "${use.name}" is not available`,
              is_error: true,
            } as ContentBlock);
            continue;
          }
          if (prior?.status === "pending" && !toolDef.idempotent) {
            throw new Error(
              `non-idempotent tool "${use.name}" pending on resume; cannot safely re-run`
            );
          }
          await persistToolExecPending(
            engine,
            ctx.id,
            last.message_idx,
            use.id,
            use.name,
            use.input
          );
          try {
            const output = await toolDef.execute(use.input, {
              engine,
              jobId: ctx.id,
              remote: true,
              signal: ctx.signal,
            });
            await persistToolExecComplete(engine, ctx.id, use.id, output);
            synthesizedResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: asStringIfNotObject(output),
            } as ContentBlock);
          } catch (e) {
            const errText = e instanceof Error ? (e.stack ?? e.message) : String(e);
            await persistToolExecFailed(
              engine,
              ctx.id,
              last.message_idx,
              use.id,
              use.name,
              use.input,
              errText
            );
            synthesizedResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: errText,
              is_error: true,
            } as ContentBlock);
          }
        }
        // Persist the synthesized user turn so next-resume picks up here.
        const userIdx = nextMessageIdx++;
        await persistMessage(engine, ctx.id, {
          message_idx: userIdx,
          role: "user",
          content_blocks: synthesizedResults,
          tokens_in: null,
          tokens_out: null,
          tokens_cache_read: null,
          tokens_cache_create: null,
          model: null,
        });
        anthroMessages.push({ role: "user", content: synthesizedResults as any });
      }
    }

    // ── User-inbox drain helper ───────────────────────────
    // Check the job's inbox for user-sent steering messages and inject
    // them as Anthropic user-messages into the conversation. Persist so
    // replay is consistent. Called before each LLM turn.
    async function drainUserInbox(): Promise<number> {
      const messages = await ctx.readInbox();
      let added = 0;
      for (const m of messages) {
        if (m.sender !== "user") continue;
        const text = typeof m.payload === "string" ? m.payload : JSON.stringify(m.payload);
        const userBlock: Anthropic.TextBlock = { type: "text", text };
        anthroMessages.push({ role: "user", content: [userBlock] });
        await persistMessage(engine, ctx.id, {
          message_idx: nextMessageIdx++,
          role: "user",
          content_blocks: [userBlock as unknown as ContentBlock],
          tokens_in: null,
          tokens_out: null,
          tokens_cache_read: null,
          tokens_cache_create: null,
          model: null,
        });
        added++;
        // Log for audit trail.
        logSubagentHeartbeat({
          job_id: ctx.id,
          event: "user_inbox_message_consumed",
          message_id: m.id,
          sender: m.sender,
        });
      }
      return added;
    }

    // Drain once before the first turn (messages that arrived while the
    // job was waiting to be claimed or paused/resumed).
    await drainUserInbox();

    // ── Main loop ───────────────────────────────────────────
    let stopReason: SubagentStopReason = "error";
    let finalText = "";

    while (true) {
      if (assistantTurns >= maxTurns) {
        stopReason = "max_turns";
        break;
      }
      if (ctx.signal.aborted || ctx.shutdownSignal.aborted) {
        stopReason = "error";
        throw new Error("subagent aborted before turn");
      }

      // Check inbox again at the start of every turn — user may have
      // sent steering messages while we were executing tools.
      await drainUserInbox();

      // 0. Budget gate — check owner's budget_remaining_cents BEFORE
      //    acquiring a rate lease. If the budget owner (supervisor) has
      //    a remaining balance set, deduct a per-turn estimate. Throws
      //    BudgetExhausted when the owner is out of money, which aborts
      //    the subagent cleanly without consuming a lease slot.
      //
      //    Conservative estimate: 5 cents/turn covers a typical Sonnet
      //    tool-use turn (~4K input, ~1K output with cache reads).
      //    Over-estimating is safe — unused reservation stays on owner.
      const TURN_COST_ESTIMATE_CENTS = 5;
      const reservation = await reserveBudget(engine, ctx.id, TURN_COST_ESTIMATE_CENTS);
      if (reservation.kind === "exhausted") {
        // Owner is out of budget — abort cleanly. The supervisor's
        // on_child_fail: "continue" policy means this child failure
        // doesn't kill the whole tree; remaining children also hit
        // the gate and abort in turn.
        stopReason = "error";
        throw new Error(
          `budget exhausted: balance ${reservation.balance_at_attempt} cents, needed ${reservation.requested_cents}`
        );
      }
      // no_budget or owner_deleted → proceed without budget gating

      // 1. Acquire rate lease for the outbound call.
      //
      // A1 ORDERING (v0.37.x budget cathedral):
      //
      //   +----------------------------------+
      //   | gateway.chat() inside subagent   |
      //   +-----+----------------------------+
      //         |
      //   1. getCurrentBudgetTracker()?.reserve(...)
      //         |  (runs via the gateway's AsyncLocalStorage scope,
      //         |   set by the upstream caller of the subagent.
      //         |   On BudgetExhausted: throw BEFORE we touch the lease.)
      //         v
      //   2. acquireLease(...)  <-- the line below
      //         |  (only attempted if the budget gate passed)
      //         v
      //   3. provider HTTP call
      //         |
      //         v
      //   4. tracker.record(actual usage)
      //
      // The handler body intentionally does NOT thread `BudgetTracker`
      // explicitly. Gateway-layer composition (TX5) handles it. The
      // ordering is load-bearing: a budget throw must NOT consume a
      // lease slot, because the lease is the rate-limit pacer for the
      // entire fleet.
      const lease = await acquireLease(engine, rateLeaseKey, ctx.id, maxConcurrent, {
        ttlMs: leaseTtlMs,
      });
      if (!lease.acquired) {
        // No slots — treat as a renewable error so the worker re-claims
        // the job later. Don't fail terminally.
        throw new RateLeaseUnavailableError(rateLeaseKey, lease.activeCount, lease.maxConcurrent);
      }

      let assistantMsg: Anthropic.Message;
      const turnIdx = assistantTurns;
      const t0 = Date.now();
      logSubagentHeartbeat({ job_id: ctx.id, event: "llm_call_started", turn_idx: turnIdx });

      // Renewal is short-lived; for single-call turns the initial TTL
      // covers the whole request. A mid-call renewal loop would add
      // complexity; for v0.15 we lean on the 120s TTL + abort-on-signal.
      try {
        const params: Anthropic.MessageCreateParamsNonStreaming = {
          // v0.41 Bug 3: strip `provider:` prefix at the SDK call site only.
          // `model` stays qualified everywhere else (persistence, recipe
          // lookup at recipeIdFromModel(), capability gate).
          model: stripProviderPrefix(model),
          // v0.42.38.0+ — Use per-specialist maxOutputTokens if set, else
          // tier-based default. Was hardcoded 4096 for all legacy-path calls.
          max_tokens: maxOutputTokens ?? MAX_TOKENS_BY_TIER[modelTier ?? "subagent"] ?? 4096,
          // v0.42.38.0+ — Split system into 2 cache breakpoints with mixed TTLs:
          // 1. Base system prompt: ttl="1h" (stable across ALL calls to this
          //    specialist, survives layer transitions that may take >5 min)
          // 2. cached_context: ttl="5m" (changes per layer, only needs to
          //    survive within a layer's map batches)
          // Per Anthropic docs: longer-TTL entries must appear before shorter.
          // The system breakpoint caches tools + system together (render order
          // is tools → system → messages), so NO separate tool breakpoint is
          // needed — that would waste a 3rd breakpoint slot.
          // Total: 2 of 4 breakpoints used (2 spare for future message-level).
          system: data.cached_context
            ? ([
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral", ttl: "1h" },
                },
                {
                  type: "text",
                  text: "## KONTEXT (aus vorherigen Layern)\n" + String(data.cached_context),
                  cache_control: { type: "ephemeral", ttl: "5m" },
                },
              ] as any)
            : ([
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral", ttl: "1h" },
                },
              ] as any),
          messages: anthroMessages,
          ...(toolDefs.length > 0
            ? {
                tools: toolDefs.map((t) => {
                  const def: any = {
                    name: t.name,
                    description: t.description,
                    input_schema: t.input_schema,
                  };
                  // v0.42.38.0+ — NO cache_control on tools. The system
                  // breakpoint above already caches tools + system together
                  // (Anthropic render order: tools → system → messages).
                  // A separate tool breakpoint was redundant and wasted a slot.
                  return def;
                }),
              }
            : {}),
        };

        const combinedSignal = mergeSignals(ctx.signal, ctx.shutdownSignal);
        assistantMsg = await client.create(params, { signal: combinedSignal });
      } catch (err) {
        // Release lease eagerly on error so we don't starve capacity.
        await releaseLease(engine, lease.leaseId!).catch(() => {});
        // Terminal classification: a 400 "prompt is too long" from Anthropic
        // is unrecoverable — retrying with the same prompt will always fail.
        // Convert to UnrecoverableError so the worker routes the job
        // straight to `dead`, bypassing max_stalled retries (the v0.30.x
        // dream-cycle queue-clog the chunking work was built to prevent).
        if (isPromptTooLongError(err)) {
          const origMsg = err instanceof Error ? err.message : String(err);
          throw new UnrecoverableError(`prompt_too_long: ${origMsg}`);
        }
        throw err;
      }

      // 2. Release lease as soon as the call returns. Tool execution runs
      //    outside the lease — tool calls use their own capacity.
      await releaseLease(engine, lease.leaseId!).catch(() => {});

      const ms = Date.now() - t0;
      const inTokens = assistantMsg.usage?.input_tokens ?? 0;
      const outTokens = assistantMsg.usage?.output_tokens ?? 0;
      const cacheRead = (assistantMsg.usage as any)?.cache_read_input_tokens ?? 0;
      const cacheCreate = (assistantMsg.usage as any)?.cache_creation_input_tokens ?? 0;

      tokenTotals.in += inTokens;
      tokenTotals.out += outTokens;
      tokenTotals.cache_read += cacheRead;
      tokenTotals.cache_create += cacheCreate;

      logSubagentHeartbeat({
        job_id: ctx.id,
        event: "llm_call_completed",
        turn_idx: turnIdx,
        ms_elapsed: ms,
        tokens: { in: inTokens, out: outTokens, cache_read: cacheRead, cache_create: cacheCreate },
      });

      // Update job-level token rollup (best-effort; may throw if lock lost).
      await ctx.updateTokens({
        input: inTokens,
        output: outTokens,
        cache_read: cacheRead,
      });

      const blocks = assistantMsg.content as ContentBlock[];

      // 3. Persist the assistant message BEFORE tool dispatch so replay
      //    sees a consistent state.
      const assistantIdx = nextMessageIdx++;
      await persistMessage(engine, ctx.id, {
        message_idx: assistantIdx,
        role: "assistant",
        content_blocks: blocks,
        tokens_in: inTokens,
        tokens_out: outTokens,
        tokens_cache_read: cacheRead,
        tokens_cache_create: cacheCreate,
        model,
      });
      anthroMessages.push({ role: "assistant", content: blocks as any });
      assistantTurns++;

      // 4. Collect tool_use blocks. If none, we're done.
      const toolUses = blocks.filter(
        (
          b
        ): b is { type: "tool_use"; id: string; name: string; input: unknown } & Record<
          string,
          unknown
        > => b.type === "tool_use"
      );
      if (toolUses.length === 0) {
        stopReason = "end_turn";
        // Concatenate text blocks as the final answer.
        finalText = blocks
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text as string)
          .join("\n");
        break;
      }

      // 5. Dispatch each tool_use. Two-phase persist (pending → complete/failed).
      const toolResults: ContentBlock[] = [];
      for (const use of toolUses) {
        if (ctx.signal.aborted || ctx.shutdownSignal.aborted) {
          throw new Error("subagent aborted during tool dispatch");
        }

        const toolName = use.name;
        const toolDef = toolDefs.find((t) => t.name === toolName);
        if (!toolDef) {
          // Model called a tool we didn't expose. Mark execution failed
          // with a clear error and feed the error back in the next turn.
          await persistToolExecFailed(
            engine,
            ctx.id,
            assistantIdx,
            use.id,
            toolName,
            use.input,
            `tool "${toolName}" is not in the registry for this subagent`
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: `tool "${toolName}" is not available`,
            is_error: true,
          } as ContentBlock);
          logSubagentHeartbeat({
            job_id: ctx.id,
            event: "tool_failed",
            turn_idx: turnIdx,
            tool_name: toolName,
            error: "not in registry",
          });
          continue;
        }

        // Replay: if we already have a row for this tool_use_id, trust it
        // unless status='pending' and the tool is idempotent (re-run).
        const prior = priorToolByUseId.get(use.id);
        if (prior && prior.status === "complete") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: asStringIfNotObject(prior.output),
          } as ContentBlock);
          continue;
        }
        if (prior && prior.status === "failed") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: prior.error ?? "tool failed",
            is_error: true,
          } as ContentBlock);
          continue;
        }
        if (prior && prior.status === "pending" && !toolDef.idempotent) {
          // Non-idempotent and we don't know the outcome — fail the job.
          throw new Error(
            `non-idempotent tool "${toolName}" pending on resume; cannot safely re-run`
          );
        }

        // Fresh or idempotent-replay dispatch.
        await persistToolExecPending(engine, ctx.id, assistantIdx, use.id, toolName, use.input);
        logSubagentHeartbeat({
          job_id: ctx.id,
          event: "tool_called",
          turn_idx: turnIdx,
          tool_name: toolName,
        });

        const toolStart = Date.now();
        try {
          const output = await toolDef.execute(use.input, {
            engine,
            jobId: ctx.id,
            remote: true,
            signal: ctx.signal,
          });
          await persistToolExecComplete(engine, ctx.id, use.id, output);
          logSubagentHeartbeat({
            job_id: ctx.id,
            event: "tool_result",
            turn_idx: turnIdx,
            tool_name: toolName,
            ms_elapsed: Date.now() - toolStart,
          });

          // GAP-04: Iterative Agentic Search — if brain_search returned
          // sparse results, append a refinement hint to encourage the LLM
          // to try alternative terms in the next turn.
          // v0.42.38.0+ — Apply trimToolOutput BEFORE serialization (was missing
          // in legacy path, causing 10-30k token brain_get_page results to
          // bloat conversation history).
          const trimmedOutput = trimToolOutput(output);
          let resultContent = asStringIfNotObject(trimmedOutput);
          if (
            toolName === "brain_search" &&
            typeof output === "object" &&
            output !== null &&
            !Array.isArray(output) &&
            "result_count" in output
          ) {
            const count = (output as { result_count?: number }).result_count;
            if (typeof count === "number" && count < 3) {
              const related = (output as { related_concepts?: string[] }).related_concepts;
              const hint =
                related && related.length > 0
                  ? `\n\n[HINT] Only ${count} results found. Consider refining your search using these related terms: ${related.join(", ")}. You can also try synonyms, alternative legal terminology, or English keywords.`
                  : `\n\n[HINT] Only ${count} results found. Consider refining your search with synonyms, alternative legal terminology, or English keywords.`;
              resultContent = resultContent + hint;
            }
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: resultContent,
          } as ContentBlock);
        } catch (e) {
          const errText = e instanceof Error ? (e.stack ?? e.message) : String(e);
          await persistToolExecFailed(
            engine,
            ctx.id,
            assistantIdx,
            use.id,
            toolName,
            use.input,
            errText
          );
          logSubagentHeartbeat({
            job_id: ctx.id,
            event: "tool_failed",
            turn_idx: turnIdx,
            tool_name: toolName,
            ms_elapsed: Date.now() - toolStart,
            error: errText,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: errText,
            is_error: true,
          } as ContentBlock);
        }
      }

      // 6. Append the synthesized user turn (tool_result wrappers) to the
      //    conversation and persist it so replay picks it up.
      const userIdx = nextMessageIdx++;
      await persistMessage(engine, ctx.id, {
        message_idx: userIdx,
        role: "user",
        content_blocks: toolResults,
        tokens_in: null,
        tokens_out: null,
        tokens_cache_read: null,
        tokens_cache_create: null,
        model: null,
      });
      anthroMessages.push({ role: "user", content: toolResults as any });
    }

    return {
      result: finalText,
      turns_count: assistantTurns,
      stop_reason: stopReason,
      tokens: tokenTotals,
    };
  };
}

// ── v0.38 Gateway-native subagent path ──────────────────────

interface GatewayRunArgs {
  engine: BrainEngine;
  ctx: MinionJobContext;
  data: SubagentHandlerData;
  model: string;
  systemPrompt: string;
  /** v0.42.38.0+ — Separate cacheable context (2nd cache breakpoint). */
  cachedContext?: string;
  toolDefs: ToolDef[];
  maxTurns: number;
  /** v0.42.38.0+ — specialist model tier, drives maxTokens. */
  modelTier?: "utility" | "reasoning" | "deep" | "subagent";
  /** v0.42.38.0+ — per-specialist max output tokens override. */
  maxOutputTokens?: number;
}

/**
 * v0.38 S1.5 — provider-agnostic subagent loop via `gateway.toolLoop()`.
 *
 * Adapts the existing brain-tool registry (anthropic-shaped ToolDef) to the
 * gateway's provider-neutral `ChatToolDef` + `ToolHandler` shapes, wires
 * persistence callbacks that use the v0.38 stable-ID columns (ordinal +
 * gbrain_tool_use_id from migration v81), and invokes the gateway loop.
 *
 * Replay semantics: loads prior `subagent_messages` + `subagent_tool_executions`,
 * builds a `ToolLoopReplayState` keyed by `gbrain_tool_use_id`. For pre-v81
 * legacy rows (ordinal NULL), the D5 read-time shim synthesizes a stable key
 * from `(job_id, message_idx, content_blocks index, tool_name)` so the
 * reconciler sees both shapes uniformly.
 */

// ── Module-level tool-output trimming (shared by gateway + legacy paths) ──
// v0.42.38.0+ — Extracted from runSubagentViaGateway so BOTH code paths
// (gateway + legacy Anthropic-direct) apply the same trimming. Previously
// the legacy path fed full untrimmed tool outputs (10-30k tokens for
// brain_get_page) back into the conversation, causing massive token bloat.
const TOOL_OUTPUT_MAX_RESULTS = 5;
const TOOL_OUTPUT_MAX_CHARS = 800;
const STRIP_FIELDS = new Set([
  "base_score",
  "statute_area_boost",
  "legal_authority_boost",
  "cognitive_tier_boost",
  "legal_para_boost",
  "chunk_index",
  "chunk_id",
  "chunk_source",
  "stale",
  "source_id",
  "effective_date_source",
  "evidence",
  "create_safety",
  "score",
]);
function stripScoreFields(item: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(item)) {
    if (!STRIP_FIELDS.has(key)) {
      result[key] = item[key];
    }
  }
  return result;
}
function trimChunkText(obj: Record<string, unknown>): Record<string, unknown> {
  if (typeof obj.chunk_text === "string" && obj.chunk_text.length > TOOL_OUTPUT_MAX_CHARS) {
    return { ...obj, chunk_text: obj.chunk_text.slice(0, TOOL_OUTPUT_MAX_CHARS) + " […]" };
  }
  return obj;
}
function trimResultItem(item: unknown): unknown {
  if (item && typeof item === "object") {
    return trimChunkText(stripScoreFields(item as Record<string, unknown>));
  }
  return item;
}
function trimToolOutputInner(output: unknown): unknown {
  if (!output) return output;
  if (Array.isArray(output)) {
    return output.slice(0, TOOL_OUTPUT_MAX_RESULTS).map(trimResultItem);
  }
  if (typeof output === "object" && output !== null) {
    const obj = output as Record<string, unknown>;
    const trimmed: Record<string, unknown> = { ...obj };
    if (
      typeof trimmed.compiled_truth === "string" &&
      trimmed.compiled_truth.length > TOOL_OUTPUT_MAX_CHARS * 4
    ) {
      trimmed.compiled_truth = trimmed.compiled_truth.slice(0, TOOL_OUTPUT_MAX_CHARS * 4) + " […]";
    }
    if (
      typeof trimmed.frontmatter === "string" &&
      trimmed.frontmatter.length > TOOL_OUTPUT_MAX_CHARS * 2
    ) {
      trimmed.frontmatter = trimmed.frontmatter.slice(0, TOOL_OUTPUT_MAX_CHARS * 2) + " […]";
    }
    if (Array.isArray(trimmed.results)) {
      trimmed.results = (trimmed.results as unknown[])
        .slice(0, TOOL_OUTPUT_MAX_RESULTS)
        .map(trimResultItem);
    }
    return trimmed;
  }
  return output;
}
export function trimToolOutput(output: unknown): unknown {
  try {
    return trimToolOutputInner(output);
  } catch (err) {
    console.error(
      `[trimToolOutput] ERROR (returning placeholder):`,
      err instanceof Error ? err.message : String(err)
    );
    return { error: "tool_output_trim_failed", output: null };
  }
}

// v0.42.38.0+ — Module-level maxTokensByTier (shared by gateway + legacy paths).
// utility (Haiku): 4096 — short extraction tasks
// reasoning (Sonnet): 8192 — detailed legal analysis
// deep (Sonnet/Opus): 8192 — complex multi-step reasoning
// subagent (Haiku): 4096 — meta-loop, short turns
const MAX_TOKENS_BY_TIER: Record<string, number> = {
  utility: 4096,
  reasoning: 8192,
  deep: 8192,
  subagent: 4096,
};

// v0.42.38.0+ — Pipeline-shared tool cache. Keyed by caseSlug so all
// specialists in the same pipeline share get_page results. GC'd after
// 10min idle to prevent memory leaks from abandoned pipelines.
interface PipelineCacheEntry {
  cache: Map<string, { value: unknown; size: number }>;
  bytes: number;
  order: string[];
  lastAccess: number;
}
const PIPELINE_TOOL_CACHES = new Map<string, PipelineCacheEntry>();
const PIPELINE_CACHE_GC_INTERVAL_MS = 10 * 60 * 1000; // 10min
const PIPELINE_CACHE_MAX_IDLE_MS = 10 * 60 * 1000; // 10min idle → GC
// Run GC periodically (lazy: only checks when a new cache is created)
function gcPipelineCaches(): void {
  const now = Date.now();
  for (const [key, entry] of PIPELINE_TOOL_CACHES) {
    if (now - entry.lastAccess > PIPELINE_CACHE_MAX_IDLE_MS) {
      PIPELINE_TOOL_CACHES.delete(key);
    }
  }
}

async function runSubagentViaGateway(args: GatewayRunArgs): Promise<SubagentResult> {
  const {
    engine,
    ctx,
    data,
    model,
    systemPrompt,
    cachedContext,
    toolDefs,
    maxTurns,
    maxOutputTokens,
  } = args;

  // Map ToolDef → ChatToolDef (gateway shape). The gateway's chat() bridges
  // this to provider-specific tool definitions via the Vercel AI SDK.
  const chatTools: ChatToolDef[] = toolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema as Record<string, unknown>,
  }));

  // Map ToolDef → ToolHandler (gateway shape). Each handler is a thin wrapper
  // that invokes the existing brain-tool dispatch.
  const toolHandlers = new Map<string, ToolHandler>();
  // v0.42.38.0+ — Tool-output trimming for cost optimization.
  // brain_query/brain_search return arrays of results with full chunk_text.
  // Each result ~500-2000 chars. With 10 results = 10-20K tokens per tool-call.
  // In multi-turn loops (4-8 turns × 4-8 tool-calls), this balloons to 160K+ tokens
  // of tool-results PER specialist. Trimming to top-5 results + 500 chars each
  // cuts tool-result tokens by 80% without losing signal.
  // v0.42.38.0+ — Trim functions extracted to module level (shared with legacy path).
  // v0.42.38.0+ — In-process LRU cache for idempotent read tools.
  // Multiple specialists in the same pipeline run often read the same page
  // via get_page (e.g. "§ 146 StGB" is read by both legal-grounding and
  // damage-extractor). The engine's query_cache handles search/query on the
  // DB side, but get_page always hits the DB. This cache short-circuits
  // identical get_page calls within the same process, saving DB load and
  // tool dispatch overhead.
  // v0.42.38.0+ — SHARED across specialists in the same pipeline via a
  // pipeline-level cache keyed by caseSlug. Previously per-specialist, meaning
  // 5 specialists reading "§ 146 StGB" = 5 DB calls. Now 1 DB call, 5 cache hits.
  // Falls back to per-job cache if no caseSlug is provided.
  // Only caches get_page (deterministic by slug); search/query have variable
  // results depending on index state so they're left to the engine's query_cache.
  // v0.42.38.0+ — Hardened: size-budgeted LRU (max 50 entries AND max 2MB total).
  const TOOL_CACHE_MAX_ENTRIES = 50;
  const TOOL_CACHE_MAX_BYTES = 2 * 1024 * 1024; // 2MB
  const cacheableToolNames = new Set(["get_page", "brain_get_page"]);
  const cacheKey = (toolName: string, input: unknown): string => {
    try {
      return `${toolName}:${JSON.stringify(input)}`;
    } catch {
      return `${toolName}:${String(input)}`;
    }
  };
  const estimateBytes = (v: unknown): number => {
    try {
      return JSON.stringify(v).length * 2; // ~2 bytes per char (UTF-16)
    } catch {
      return 4096; // fallback estimate for non-serializable
    }
  };

  // Pipeline-shared cache: keyed by caseSlug, shared across all specialists
  // in the same pipeline run. Created once per pipeline, GC'd after 10min idle.
  const pipelineCacheKey = (ctx.data as Record<string, unknown>)?._case_slug as string | undefined;
  let toolCache: Map<string, { value: unknown; size: number }>;
  let toolCacheBytes: number;
  let toolCacheOrder: string[];
  if (pipelineCacheKey) {
    if (!PIPELINE_TOOL_CACHES.has(pipelineCacheKey)) {
      gcPipelineCaches(); // lazy GC of stale pipeline caches
      PIPELINE_TOOL_CACHES.set(pipelineCacheKey, {
        cache: new Map(),
        bytes: 0,
        order: [],
        lastAccess: Date.now(),
      });
    }
    const shared = PIPELINE_TOOL_CACHES.get(pipelineCacheKey)!;
    shared.lastAccess = Date.now();
    toolCache = shared.cache;
    toolCacheBytes = shared.bytes;
    toolCacheOrder = shared.order;
  } else {
    // Fallback: per-job cache (no pipeline context)
    toolCache = new Map();
    toolCacheBytes = 0;
    toolCacheOrder = [];
  }
  const evictOne = () => {
    const oldest = toolCacheOrder.shift();
    if (oldest) {
      const entry = toolCache.get(oldest);
      if (entry) {
        toolCacheBytes -= entry.size;
        toolCache.delete(oldest);
        if (pipelineCacheKey) {
          const shared = PIPELINE_TOOL_CACHES.get(pipelineCacheKey);
          if (shared) shared.bytes = toolCacheBytes;
        }
      }
    }
  };
  for (const t of toolDefs) {
    const isCacheable = cacheableToolNames.has(t.name) && t.idempotent === true;
    toolHandlers.set(t.name, {
      idempotent: t.idempotent === true,
      async execute(input: unknown, signal: AbortSignal): Promise<unknown> {
        if (isCacheable) {
          const key = cacheKey(t.name, input);
          const cached = toolCache.get(key);
          if (cached) {
            // LRU: move to end (most recently used)
            const idx = toolCacheOrder.indexOf(key);
            if (idx >= 0) toolCacheOrder.splice(idx, 1);
            toolCacheOrder.push(key);
            return cached.value;
          }
        }
        const raw = await t.execute(input, {
          engine,
          jobId: ctx.id,
          remote: true,
          signal,
        });
        const trimmed = trimToolOutput(raw);
        if (isCacheable) {
          const key = cacheKey(t.name, input);
          const size = estimateBytes(trimmed);
          // Only cache if the value is reasonably sized (skip >1MB single entries)
          if (size < 1024 * 1024) {
            // Evict until we have room
            while (
              toolCacheOrder.length >= TOOL_CACHE_MAX_ENTRIES ||
              toolCacheBytes + size > TOOL_CACHE_MAX_BYTES
            ) {
              if (toolCacheOrder.length === 0) break;
              evictOne();
            }
            toolCache.set(key, { value: trimmed, size });
            toolCacheOrder.push(key);
            toolCacheBytes += size;
            // Sync shared pipeline cache bytes
            if (pipelineCacheKey) {
              const shared = PIPELINE_TOOL_CACHES.get(pipelineCacheKey);
              if (shared) {
                shared.bytes = toolCacheBytes;
                shared.lastAccess = Date.now();
              }
            }
          }
        }
        return trimmed;
      },
    });
  }

  // Load prior state (replay support via D5 shim for legacy v1 rows).
  const priorMessages = await loadPriorMessages(engine, ctx.id);
  const priorTools = await loadPriorToolsV2(engine, ctx.id);
  const priorToolsByStableKey = new Map<
    string,
    {
      status: "pending" | "complete" | "failed";
      output?: unknown;
      error?: string;
      toolUseId?: string | null;
    }
  >();
  for (const row of priorTools) {
    priorToolsByStableKey.set(row.stableKey, {
      status: row.status,
      output: row.output,
      error: row.error ?? undefined,
      toolUseId: row.toolUseId,
    });
  }

  // Convert prior Anthropic-shape messages → ChatMessage with ChatBlock content.
  // v1 rows store Anthropic content blocks ({type:'tool_use'|'tool_result'|...});
  // we adapt them to ChatBlock shape (type: 'tool-call' | 'tool-result' | 'text').
  const priorChatMessages: ChatMessage[] = priorMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: adaptContentBlocksToChatBlocks(m.content_blocks),
  }));

  // v0.42.38.0+ — Reconstruct missing tool-result user messages.
  //
  // The gateway toolLoop pushes tool-results as `role: "user"` messages, but
  // only the assistant turn is persisted via onAssistantTurn. The tool-result
  // user message is NOT persisted (no callback for it). On crash-replay, the
  // loaded priorMessages contain assistant messages with tool-call blocks but
  // NO corresponding tool-result user messages — causing "Tool results are
  // missing for tool calls" errors on the next API call.
  //
  // Fix: after loading priorMessages, scan for assistant messages that contain
  // tool-call blocks. If the next message is NOT a user message with tool-result
  // blocks, synthesize one from the persisted subagent_tool_executions rows.
  // This ensures the replay conversation is consistent before entering the loop.
  //
  // Edge case: when the provider returns duplicate tool_use IDs (e.g. all
  // "toolu_bdrk_0"), we can't match by toolUseId alone. Instead we match by
  // (toolUseId, toolName, ordinal-within-turn) — consuming tools in order so
  // each duplicate ID maps to the next unconsumed row.
  if (priorChatMessages.length > 0) {
    // Build a consumable list of priorTools ordered by message_idx + ordinal.
    // We consume from the front as we match each tool-call.
    const orderedTools = [...priorTools].sort((a, b) => {
      const aIdx = a.messageIdx ?? 0;
      const bIdx = b.messageIdx ?? 0;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return (a.ordinal ?? 0) - (b.ordinal ?? 0);
    });
    const reconstructed: ChatMessage[] = [];
    for (let i = 0; i < priorChatMessages.length; i++) {
      reconstructed.push(priorChatMessages[i]);
      const msg = priorChatMessages[i];
      // Check if this is an assistant message with tool-call blocks.
      if (
        msg.role === "assistant" &&
        Array.isArray(msg.content) &&
        msg.content.some((b) => b.type === "tool-call")
      ) {
        // Check if the next message is a user message with tool-result blocks.
        const next = priorChatMessages[i + 1];
        const hasNextToolResults =
          next &&
          next.role === "user" &&
          Array.isArray(next.content) &&
          next.content.some((b) => b.type === "tool-result");
        if (!hasNextToolResults) {
          // Reconstruct tool-result blocks from subagent_tool_executions.
          const toolCalls = msg.content.filter(
            (b): b is { type: "tool-call"; toolCallId: string; toolName: string; input: unknown } =>
              b.type === "tool-call"
          );
          const toolResultBlocks: ChatBlock[] = [];
          for (const tc of toolCalls) {
            // Find the matching tool execution by provider tool_use_id.
            // For duplicate IDs, consume the next matching unconsumed row.
            // Only match by exact toolUseId — null toolUseId means the row
            // was persisted before the provider returned an id, so we can't
            // safely match it to any tool-call.
            const matchIdx = orderedTools.findIndex((t) => t.toolUseId === tc.toolCallId);
            if (matchIdx >= 0) {
              const matchingTool = orderedTools.splice(matchIdx, 1)[0];
              toolResultBlocks.push({
                type: "tool-result",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                output:
                  matchingTool.status === "failed"
                    ? matchingTool.error
                    : sanitizeForJson(matchingTool.output),
                isError: matchingTool.status === "failed",
              });
            } else {
              // No matching tool execution found — synthesize an error result
              // so the conversation is at least consistent (the API won't
              // reject it for missing tool-results).
              toolResultBlocks.push({
                type: "tool-result",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                output: "tool execution result not found in replay state",
                isError: true,
              });
            }
          }
          if (toolResultBlocks.length > 0) {
            reconstructed.push({ role: "user", content: toolResultBlocks });
          }
        }
      }
    }
    // Replace priorChatMessages with the reconstructed version.
    if (reconstructed.length > priorChatMessages.length) {
      console.error(
        `[subagent-gateway] reconstructed ${reconstructed.length - priorChatMessages.length} missing tool-result message(s) for job ${ctx.id}`
      );
      priorChatMessages.length = 0;
      priorChatMessages.push(...reconstructed);
    }
  }

  // Initial seed message if no prior state.
  const initialMessages: ChatMessage[] =
    priorChatMessages.length === 0 ? [{ role: "user", content: data.prompt }] : [];

  // Persist seed user message at idx 0 if fresh start.
  let nextMessageIdx = priorChatMessages.length;
  if (nextMessageIdx === 0) {
    await persistMessage(engine, ctx.id, {
      message_idx: 0,
      role: "user",
      content_blocks: [{ type: "text", text: data.prompt }] as ContentBlock[],
      tokens_in: null,
      tokens_out: null,
      tokens_cache_read: null,
      tokens_cache_create: null,
      model: null,
    });
    nextMessageIdx = 1;
  }

  // Capability detection drives cache_control injection.
  const verdict = classifyCapabilities(model);
  const cacheSystem = verdict === "ok" || verdict === "degraded:no_parallel";

  // Heartbeat bridge.
  const heartbeat = (event: string, payload: Record<string, unknown>) => {
    logSubagentHeartbeat({
      job_id: ctx.id,
      event: event as any,
      ...payload,
    } as any);
  };

  // Run the loop.
  // v0.42.38.0+ — maxTokens based on model tier.
  // utility (Haiku): 4096 — short extraction tasks
  // reasoning (Sonnet): 8192 — detailed legal analysis
  // deep (Sonnet/Opus): 8192 — complex multi-step reasoning
  // subagent (Haiku): 4096 — meta-loop, short turns
  // v0.42.38.0+ — Moved to module level so both gateway + legacy paths share it.
  // v0.42.38.0+ — Per-specialist maxOutputTokens overrides tier default.
  // Extraction specialists set 1024-2048 (short JSON), reasoning sets 4096.
  const maxTokens = maxOutputTokens ?? MAX_TOKENS_BY_TIER[args.modelTier ?? "subagent"] ?? 4096;

  // v0.42.38.0+ — Pass cachedContext separately to the gateway so it can
  // create a 2nd cache breakpoint (base system + context). Previously
  // concatenated into one string, which meant changing context invalidated
  // the base system cache. Now the gateway splits them into 2 system parts.
  const result = await gatewayToolLoop({
    model,
    system: systemPrompt,
    cachedContext,
    initialMessages,
    tools: chatTools,
    toolHandlers,
    maxTurns,
    maxTokens,
    abortSignal: ctx.signal,
    cacheSystem,
    // ALWAYS pass replayState (even on fresh runs) so the gateway loop's
    // messageIdx counter starts at `nextMessageIdx` (1 on fresh, after the
    // seed user write above). Without this, the loop defaults to messageIdx=0
    // on fresh runs and the first onAssistantTurn callback tries to write
    // role='assistant' at idx 0, colliding with the seed user message at idx 0
    // (unique constraint on (job_id, message_idx)). Pinned by
    // test/e2e/subagent-gateway-path.test.ts ("happy path 1-turn" + "write-
    // ordering invariant").
    replayState: {
      priorMessages: priorChatMessages,
      priorTools: priorToolsByStableKey,
      nextTurnIdx: priorChatMessages.filter((m) => m.role === "assistant").length,
      nextMessageIdx,
    },
    onAssistantTurn: async (turnIdx, messageIdx, blocks, usage, modelStr) => {
      // Convert ChatBlock[] back to ContentBlock-shaped JSONB for persistence.
      // Storing the gateway's provider-neutral shape is the v2 content_blocks
      // contract; the D5 shim handles legacy reads from v1 rows.
      await persistMessage(engine, ctx.id, {
        message_idx: messageIdx,
        role: "assistant",
        content_blocks: blocks as unknown as ContentBlock[],
        tokens_in: usage.input_tokens,
        tokens_out: usage.output_tokens,
        tokens_cache_read: usage.cache_read_tokens,
        tokens_cache_create: usage.cache_creation_tokens,
        model: modelStr,
      });
      await ctx.updateTokens({
        input: usage.input_tokens,
        output: usage.output_tokens,
        cache_read: usage.cache_read_tokens,
      });
      heartbeat("llm_call_completed", { turn_idx: turnIdx, tokens: usage });
    },
    onToolCallStart: async (turnIdx, messageIdx, ordinal, toolName, input, providerToolCallId) => {
      // CRITICAL — read back the canonical gbrain_tool_use_id from RETURNING,
      // NOT the locally-generated UUID. On crash-replay the (job_id,
      // message_idx, ordinal) row already exists with the ORIGINAL UUID from
      // the pre-crash run; the ON CONFLICT DO UPDATE keeps it. If we
      // returned the freshly-generated `candidateId` instead, the gateway
      // loop's `replayState.priorTools.get(stableKey)` lookup would miss
      // because priorTools is keyed by the original UUID — the short-
      // circuit silently breaks and the tool re-executes. Pinned by
      // test/e2e/subagent-crash-replay-multi-provider.test.ts.
      const candidateId = randomUUIDv7();
      const rows = await engine.executeRaw<{ gbrain_tool_use_id: string }>(
        `INSERT INTO subagent_tool_executions
           (job_id, message_idx, tool_use_id, tool_name, input, status, schema_version, ordinal, gbrain_tool_use_id, provider_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', 2, $6, $7, $8)
         ON CONFLICT (job_id, message_idx, ordinal) DO UPDATE
           SET status = subagent_tool_executions.status
         RETURNING gbrain_tool_use_id::text AS gbrain_tool_use_id`,
        [
          ctx.id,
          messageIdx,
          providerToolCallId,
          toolName,
          JSON.stringify(input ?? null),
          ordinal,
          candidateId,
          recipeIdFromModel(model),
        ]
      );
      const gbrainToolUseId = rows[0]?.gbrain_tool_use_id ?? candidateId;
      heartbeat("tool_called", { turn_idx: turnIdx, tool_name: toolName });
      return { gbrainToolUseId };
    },
    onToolCallComplete: async (gbrainToolUseId, output) => {
      await engine.executeRaw(
        `UPDATE subagent_tool_executions
           SET status = 'complete', output = $1::jsonb, ended_at = now()
         WHERE gbrain_tool_use_id::text = $2`,
        [JSON.stringify(output ?? null), gbrainToolUseId]
      );
    },
    onToolCallFailed: async (gbrainToolUseId, errorMsg) => {
      await engine.executeRaw(
        `UPDATE subagent_tool_executions
           SET status = 'failed', error = $1, ended_at = now()
         WHERE gbrain_tool_use_id::text = $2`,
        [errorMsg, gbrainToolUseId]
      );
    },
    onHeartbeat: heartbeat,
  });

  // Map gateway stop reason to SubagentStopReason. SubagentStopReason has
  // {end_turn, max_turns, refusal, error}; aborted maps to error.
  const stopReason: SubagentStopReason =
    result.stopReason === "end"
      ? "end_turn"
      : result.stopReason === "max_turns"
        ? "max_turns"
        : result.stopReason === "refusal"
          ? "refusal"
          : result.stopReason === "content_filter"
            ? "refusal"
            : result.stopReason === "aborted"
              ? "error"
              : "end_turn";

  return {
    result: result.finalText,
    turns_count: result.totalTurns,
    stop_reason: stopReason,
    tokens: {
      in: result.totalUsage.input_tokens,
      out: result.totalUsage.output_tokens,
      cache_read: result.totalUsage.cache_read_tokens,
      cache_create: result.totalUsage.cache_creation_tokens,
    },
  };
}

function recipeIdFromModel(modelString: string): string {
  const idx = modelString.indexOf(":");
  return idx > 0 ? modelString.slice(0, idx) : "anthropic";
}

/**
 * Strip the `provider:` prefix from a model string. Returns the bare
 * model id the Anthropic Messages API expects. Idempotent on already-bare
 * strings.
 *
 *   stripProviderPrefix('anthropic:claude-sonnet-4-6') === 'claude-sonnet-4-6'
 *   stripProviderPrefix('claude-sonnet-4-6') === 'claude-sonnet-4-6'
 *
 * v0.41 Bug 3 — pre-fix, `gbrain agent run --model anthropic:claude-sonnet-4-6`
 * sent the prefixed string straight into `client.messages.create()`, which
 * Anthropic rejects with "model not found." Omitting `--model` worked because
 * `resolveModel()` returns the bare id; explicit-model users hit the bug.
 *
 * Used ONLY at the SDK call site. The wider `model` variable stays
 * qualified everywhere else (persistence, recipe lookup, capability gate)
 * because those readers want the provider info.
 */
export function stripProviderPrefix(modelString: string): string {
  const idx = modelString.indexOf(":");
  return idx > 0 ? modelString.slice(idx + 1) : modelString;
}

/**
 * D5 — adapt v1 Anthropic content blocks to v2 ChatBlock shape on read.
 * Symmetric in the other direction is handled by persisting ChatBlock[] as-is
 * (the JSONB column accepts both shapes; v2 writes carry the new vocabulary).
 */
function adaptContentBlocksToChatBlocks(blocks: unknown): ChatBlock[] | string {
  if (typeof blocks === "string") return blocks;
  if (!Array.isArray(blocks)) return [];
  const out: ChatBlock[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as Record<string, unknown>;
    const t = block.type;
    if (t === "text" && typeof block.text === "string") {
      out.push({ type: "text", text: block.text });
    } else if (t === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
      // v1 Anthropic shape
      out.push({
        type: "tool-call",
        toolCallId: block.id,
        toolName: block.name,
        input: block.input ?? {},
      });
    } else if (
      t === "tool-call" &&
      typeof block.toolCallId === "string" &&
      typeof block.toolName === "string"
    ) {
      // v2 gateway shape (re-read of own writes)
      out.push({
        type: "tool-call",
        toolCallId: block.toolCallId,
        toolName: block.toolName,
        input: block.input ?? {},
      });
    } else if (t === "tool_result" && typeof block.tool_use_id === "string") {
      // v1 Anthropic shape — tool result block (no toolName in v1; synthesize)
      out.push({
        type: "tool-result",
        toolCallId: block.tool_use_id,
        toolName: "__legacy__",
        output: block.content ?? null,
        isError: block.is_error === true,
      });
    } else if (t === "tool-result" && typeof block.toolCallId === "string") {
      out.push({
        type: "tool-result",
        toolCallId: block.toolCallId,
        toolName: typeof block.toolName === "string" ? block.toolName : "__legacy__",
        output: block.output ?? null,
        isError: block.isError === true,
      });
    }
  }
  return out;
}

interface PriorToolV2Row {
  stableKey: string;
  toolUseId: string | null;
  status: "pending" | "complete" | "failed";
  output: unknown;
  error: string | null;
  /** v0.42.38.0+: message_idx from the DB row, used for reconstructing
   *  missing tool-result user messages in replay. */
  messageIdx?: number;
  /** v0.42.38.0+: ordinal within the assistant turn, used to disambiguate
   *  duplicate provider tool_use_ids. */
  ordinal?: number | null;
}

/**
 * Load prior tool executions keyed by a stable key.
 *
 *   - v2 rows: gbrain_tool_use_id is the stable key (set at first observation
 *     by onToolCallStart).
 *   - v1 legacy rows: D5 shim synthesizes a stable key from
 *     (job_id, message_idx, ordinal-position-by-array-index, tool_name).
 *
 * Both forms resolve to the same Map<stableKey, outcome> the gateway loop
 * consults during replay.
 */
async function loadPriorToolsV2(engine: BrainEngine, jobId: number): Promise<PriorToolV2Row[]> {
  const rows = await engine.executeRaw<Record<string, unknown>>(
    `SELECT message_idx, tool_use_id, tool_name, ordinal, gbrain_tool_use_id::text AS gbrain_tool_use_id,
            status, output, error
       FROM subagent_tool_executions
      WHERE job_id = $1
      ORDER BY message_idx, COALESCE(ordinal, 0), id`,
    [jobId]
  );
  return rows.map((r) => {
    const gbrainId = r.gbrain_tool_use_id as string | null;
    const stableKey = gbrainId
      ? gbrainId
      : // D5 legacy shim: derive a stable key from (job, msg_idx, tool_name, tool_use_id).
        // Pre-v81 rows don't have ordinal; the provider tool_use_id is stable
        // within a single Anthropic turn so it's safe as a fallback hash input.
        `legacy:${jobId}:${r.message_idx}:${r.tool_use_id}:${r.tool_name}`;
    return {
      stableKey,
      toolUseId: (r.tool_use_id as string | null) ?? null,
      status: r.status as "pending" | "complete" | "failed",
      output: r.output,
      error: (r.error as string | null) ?? null,
      messageIdx: r.message_idx as number | undefined,
      ordinal: (r.ordinal as number | null) ?? null,
    };
  });
}

// ── Internal: persistence ───────────────────────────────────

async function loadPriorMessages(engine: BrainEngine, jobId: number): Promise<PersistedMessage[]> {
  const rows = await engine.executeRaw<Record<string, unknown>>(
    `SELECT message_idx, role, content_blocks, tokens_in, tokens_out,
            tokens_cache_read, tokens_cache_create, model
       FROM subagent_messages
      WHERE job_id = $1
      ORDER BY message_idx ASC`,
    [jobId]
  );
  return rows.map((r) => ({
    message_idx: r.message_idx as number,
    role: r.role as "user" | "assistant",
    content_blocks: (typeof r.content_blocks === "string"
      ? JSON.parse(r.content_blocks as string)
      : r.content_blocks) as ContentBlock[],
    tokens_in: (r.tokens_in as number) ?? null,
    tokens_out: (r.tokens_out as number) ?? null,
    tokens_cache_read: (r.tokens_cache_read as number) ?? null,
    tokens_cache_create: (r.tokens_cache_create as number) ?? null,
    model: (r.model as string) ?? null,
  }));
}

async function loadPriorTools(engine: BrainEngine, jobId: number): Promise<PersistedToolExec[]> {
  const rows = await engine.executeRaw<Record<string, unknown>>(
    `SELECT message_idx, tool_use_id, tool_name, input, status, output, error
       FROM subagent_tool_executions
      WHERE job_id = $1`,
    [jobId]
  );
  return rows.map((r) => ({
    message_idx: r.message_idx as number,
    tool_use_id: r.tool_use_id as string,
    tool_name: r.tool_name as string,
    input: typeof r.input === "string" ? JSON.parse(r.input) : r.input,
    status: r.status as "pending" | "complete" | "failed",
    output:
      r.output == null ? null : typeof r.output === "string" ? JSON.parse(r.output) : r.output,
    error: (r.error as string) ?? null,
  }));
}

async function persistMessage(
  engine: BrainEngine,
  jobId: number,
  msg: PersistedMessage
): Promise<void> {
  await engine.executeRaw(
    `INSERT INTO subagent_messages (job_id, message_idx, role, content_blocks,
        tokens_in, tokens_out, tokens_cache_read, tokens_cache_create, model)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     ON CONFLICT (job_id, message_idx) DO NOTHING`,
    [
      jobId,
      msg.message_idx,
      msg.role,
      JSON.stringify(msg.content_blocks),
      msg.tokens_in,
      msg.tokens_out,
      msg.tokens_cache_read,
      msg.tokens_cache_create,
      msg.model,
    ]
  );
}

async function persistToolExecPending(
  engine: BrainEngine,
  jobId: number,
  messageIdx: number,
  toolUseId: string,
  toolName: string,
  input: unknown
): Promise<void> {
  // Serialize to JSON string for the ::jsonb cast. When `input` is already a
  // string (e.g. pre-serialized), avoid double-encoding which produces a jsonb
  // scalar string instead of a jsonb object — breaking `input->>'key'` lookups.
  const jsonStr = typeof input === "string" ? input : JSON.stringify(input);
  await engine.executeRaw(
    `INSERT INTO subagent_tool_executions (job_id, message_idx, tool_use_id, tool_name, input, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
     ON CONFLICT (job_id, tool_use_id) DO NOTHING`,
    [jobId, messageIdx, toolUseId, toolName, jsonStr]
  );
}

async function persistToolExecComplete(
  engine: BrainEngine,
  jobId: number,
  toolUseId: string,
  output: unknown
): Promise<void> {
  await engine.executeRaw(
    `UPDATE subagent_tool_executions
        SET status = 'complete', output = $3::jsonb, ended_at = now()
      WHERE job_id = $1 AND tool_use_id = $2`,
    [jobId, toolUseId, typeof output === "string" ? output : JSON.stringify(output)]
  );
}

async function persistToolExecFailed(
  engine: BrainEngine,
  jobId: number,
  messageIdx: number,
  toolUseId: string,
  toolName: string,
  input: unknown,
  error: string
): Promise<void> {
  // INSERT-or-UPDATE to failed — covers both "no pending row yet" (tool
  // rejected upfront) and "pending row exists" (tool threw mid-execute).
  await engine.executeRaw(
    `INSERT INTO subagent_tool_executions (job_id, message_idx, tool_use_id, tool_name, input, status, error, ended_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'failed', $6, now())
     ON CONFLICT (job_id, tool_use_id) DO UPDATE
       SET status = 'failed', error = EXCLUDED.error, ended_at = now()`,
    [
      jobId,
      messageIdx,
      toolUseId,
      toolName,
      typeof input === "string" ? input : JSON.stringify(input),
      error,
    ]
  );
}

// ── Internal: helpers ───────────────────────────────────────

function asStringIfNotObject(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Merge two AbortSignals into one. Fires when either source aborts. No-op
 * polyfill when AbortSignal.any isn't available yet (Node ≥ 20 has it).
 */
function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyFn = (AbortSignal as any).any;
  if (typeof anyFn === "function") return anyFn([a, b]) as AbortSignal;
  // Manual merge.
  const ac = new AbortController();
  if (a.aborted || b.aborted) ac.abort();
  else {
    a.addEventListener("abort", () => ac.abort(), { once: true });
    b.addEventListener("abort", () => ac.abort(), { once: true });
  }
  return ac.signal;
}

/**
 * Error thrown when acquireLease returns acquired=false. The worker
 * treats this as a renewable error — job goes back to waiting with
 * backoff, no terminal fail.
 */
export class RateLeaseUnavailableError extends Error {
  constructor(
    public key: string,
    public active: number,
    public max: number
  ) {
    super(`rate lease "${key}" full (${active}/${max})`);
    this.name = "RateLeaseUnavailableError";
  }
}

/**
 * Detect Anthropic SDK errors that indicate the input prompt exceeded the
 * model's context window. Two recognized shapes:
 *   - `Anthropic.APIError` with `.status === 400` and message containing
 *     "prompt is too long" (current SDK wording, observed in production
 *     as `prompt is too long: 1707509 tokens > 1000000 maximum`).
 *   - Any error whose message includes "prompt is too long" (defensive
 *     against SDK-wrap shape changes).
 *
 * Case-insensitive on the phrase. Also matches `request_too_large` and
 * `invalid_request_error` types when accompanied by the same message.
 *
 * Exported for unit testing.
 */
export function isPromptTooLongError(err: unknown): boolean {
  if (!err) return false;
  // Walk both `.message` and `.error?.message` shapes.
  const msg = (err as { message?: unknown })?.message;
  const inner = (err as { error?: { message?: unknown } })?.error?.message;
  const candidates = [msg, inner].filter((s): s is string => typeof s === "string");
  for (const c of candidates) {
    if (/prompt is too long/i.test(c)) return true;
  }
  // Anthropic SDK wraps with .status; 400 + 'invalid_request_error' /
  // 'request_too_large' types both indicate the same class. Only treat
  // as terminal when the message actually says prompt-too-long; broader
  // 400s could be transient (e.g., malformed JSON from a test stub).
  const status = (err as { status?: unknown })?.status;
  const errType = (err as { error?: { type?: unknown } })?.error?.type;
  if (status === 400 && (errType === "invalid_request_error" || errType === "request_too_large")) {
    for (const c of candidates) {
      if (/too long|exceed|maximum/i.test(c)) return true;
    }
  }
  return false;
}

// ── Testing surface ─────────────────────────────────────────

export const __testing = {
  loadPriorMessages,
  loadPriorTools,
  persistMessage,
  persistToolExecPending,
  persistToolExecComplete,
  persistToolExecFailed,
  asStringIfNotObject,
  DEFAULT_MODEL,
  // v0.38 Slice 1 D5 — read-time shim for crash-replay across the v1→v2
  // content_blocks shape boundary. Exposed for test/subagent-v1-v2-shim.test.ts
  // which pins legacy-row adaptation correctness.
  adaptContentBlocksToChatBlocks,
  loadPriorToolsV2,
};
