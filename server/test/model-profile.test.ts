/**
 * Firm model profile (src/core/model-profile.ts): area map completeness,
 * floors, strict write validation, lenient read, PGLite storage round-trip,
 * and the subagent handler actually running a specialist on the tier the
 * firm picked.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";
import { EMBEDDED_SPECIALISTS } from "../src/core/minions/specialist-defs.ts";
import { makeSubagentHandler, type MessagesClient } from "../src/core/minions/handlers/subagent.ts";
import type { MinionJobContext, ToolDef } from "../src/core/minions/types.ts";
import { TIER_DEFAULTS } from "../src/core/model-config.ts";
import {
  MODEL_AREAS,
  MODEL_AREA_DEFS,
  allowedChoices,
  areaForPurpose,
  areaForSpecialist,
  buildModelProfileView,
  defaultModelProfile,
  effectiveTier,
  invalidateModelProfileCache,
  loadModelProfile,
  ModelProfileValidationError,
  parseStoredProfile,
  resolveSpecialistTier,
  saveModelProfile,
  validateProfileUpdate,
  type ModelProfile,
} from "../src/core/model-profile.ts";

function profileWith(areas: Partial<ModelProfile["areas"]>): ModelProfile {
  const p = defaultModelProfile();
  Object.assign(p.areas, areas);
  return p;
}

function expectValidationError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ModelProfileValidationError);
    expect((e as ModelProfileValidationError).code).toBe(code);
    return;
  }
  throw new Error(`expected ModelProfileValidationError(${code})`);
}

describe("area map", () => {
  test("every embedded specialist belongs to exactly one area", () => {
    const seen = new Map<string, string[]>();
    for (const def of Object.values(MODEL_AREA_DEFS)) {
      for (const s of def.specialists) seen.set(s, [...(seen.get(s) ?? []), def.id]);
    }
    for (const s of EMBEDDED_SPECIALISTS) {
      expect(seen.get(s.name), `specialist "${s.name}" has no area`).toBeDefined();
      expect(seen.get(s.name), `specialist "${s.name}" is in several areas`).toHaveLength(1);
    }
  });

  test("areas name only specialists that exist", () => {
    const names = new Set(EMBEDDED_SPECIALISTS.map((s) => s.name));
    for (const def of Object.values(MODEL_AREA_DEFS)) {
      for (const s of def.specialists) expect(names.has(s), `unknown specialist "${s}"`).toBe(true);
    }
  });

  test("liability-relevant work is floored at reasoning, quality control locked on deep", () => {
    expect(areaForSpecialist("deadline-validator")).toBe("fristen");
    expect(areaForSpecialist("limitation-scanner")).toBe("fristen");
    expect(areaForPurpose("deadline_extract")).toBe("fristen");
    expect(MODEL_AREA_DEFS.fristen.floor).toBe("reasoning");
    expect(MODEL_AREA_DEFS.chat.floor).toBe("reasoning");
    expect(MODEL_AREA_DEFS.entwuerfe.floor).toBe("reasoning");
    expect(MODEL_AREA_DEFS.qualitaet).toMatchObject({ floor: "deep", locked: true });
    expect(allowedChoices("qualitaet")).toEqual(["auto"]);
    expect(allowedChoices("fristen")).toEqual(["auto", "reasoning", "deep"]);
    expect(allowedChoices("erfassung")).toEqual(["auto", "utility", "reasoning", "deep"]);
  });
});

describe("effectiveTier", () => {
  test("auto keeps the base tier, raised to the floor", () => {
    const p = defaultModelProfile();
    expect(effectiveTier("erfassung", "utility", p)).toBe("utility");
    expect(effectiveTier("fristen", "utility", p)).toBe("reasoning");
    expect(effectiveTier("chat", "deep", p)).toBe("deep");
    expect(effectiveTier("qualitaet", "deep", p)).toBe("deep");
  });

  test("a pinned tier replaces the base tier", () => {
    expect(effectiveTier("erfassung", "reasoning", profileWith({ erfassung: "utility" }))).toBe(
      "utility"
    );
    expect(effectiveTier("chat", "reasoning", profileWith({ chat: "deep" }))).toBe("deep");
    expect(effectiveTier("chat", "deep", profileWith({ chat: "reasoning" }))).toBe("reasoning");
  });

  test("the floor wins over a profile below it (tampered row)", () => {
    const tampered = profileWith({ fristen: "utility" as never, qualitaet: "utility" as never });
    expect(effectiveTier("fristen", "utility", tampered)).toBe("reasoning");
    expect(effectiveTier("qualitaet", "deep", tampered)).toBe("deep");
  });
});

describe("validateProfileUpdate (write path, strict)", () => {
  const current = defaultModelProfile().areas;

  test("accepts allowed choices and keeps untouched areas", () => {
    const next = validateProfileUpdate(current, { chat: "deep", erfassung: "utility" });
    expect(next.chat).toBe("deep");
    expect(next.erfassung).toBe("utility");
    expect(next.fristen).toBe("auto");
  });

  test("rejects a choice below the floor", () => {
    expectValidationError(
      () => validateProfileUpdate(current, { fristen: "utility" }),
      "below_floor"
    );
  });

  test("rejects changing a locked area", () => {
    expectValidationError(
      () => validateProfileUpdate(current, { qualitaet: "reasoning" }),
      "area_locked"
    );
  });

  test("rejects unknown areas, unknown choices and non-objects", () => {
    expectValidationError(
      () => validateProfileUpdate(current, { billing: "auto" }),
      "unknown_area"
    );
    expectValidationError(() => validateProfileUpdate(current, { chat: "opus" }), "invalid_choice");
    expectValidationError(
      () => validateProfileUpdate(current, { chat: "subagent" }),
      "invalid_choice"
    );
    expectValidationError(() => validateProfileUpdate(current, null), "invalid_areas");
    expectValidationError(() => validateProfileUpdate(current, ["chat"]), "invalid_areas");
  });
});

describe("parseStoredProfile (read path, lenient)", () => {
  test("garbage yields the default profile", () => {
    expect(parseStoredProfile(null)).toEqual(defaultModelProfile());
    expect(parseStoredProfile("x")).toEqual(defaultModelProfile());
    expect(parseStoredProfile({ areas: 5 })).toEqual(defaultModelProfile());
  });

  test("invalid or below-floor values fall back to auto, valid ones survive", () => {
    const p = parseStoredProfile({
      areas: { chat: "deep", fristen: "utility", qualitaet: "reasoning", nope: "deep" },
      updated_at: "2026-09-19T10:00:00.000Z",
      updated_by: "user-1",
    });
    expect(p.areas.chat).toBe("deep");
    expect(p.areas.fristen).toBe("auto");
    expect(p.areas.qualitaet).toBe("auto");
    expect(p.updated_by).toBe("user-1");
    expect(Object.keys(p.areas).sort()).toEqual([...MODEL_AREAS].sort());
  });
});

// ── Storage + handler integration (PGLite) ─────────────────────────────

let engine: PGLiteEngine;
let queue: MinionQueue;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  queue = new MinionQueue(engine);
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

beforeEach(async () => {
  invalidateModelProfileCache();
  await engine.executeRaw("DELETE FROM subagent_messages");
  await engine.executeRaw("DELETE FROM subagent_rate_leases");
  await engine.executeRaw("DELETE FROM minion_jobs");
  await engine.executeRaw(
    `INSERT INTO sources (id, name, config) VALUES ('kanzlei-a', 'kanzlei-a', '{}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET config = '{}'::jsonb`
  );
});

describe("storage", () => {
  test("no source or unknown source → default profile", async () => {
    expect(await loadModelProfile(engine, null)).toEqual(defaultModelProfile());
    expect(await loadModelProfile(engine, "no-such-source")).toEqual(defaultModelProfile());
  });

  test("save → load round-trip, other config keys untouched", async () => {
    await engine.updateSourceConfig("kanzlei-a", { federated: false });
    const saved = await saveModelProfile(engine, "kanzlei-a", { chat: "deep" }, "admin-1");
    expect(saved.areas.chat).toBe("deep");
    expect(saved.updated_by).toBe("admin-1");
    expect(saved.updated_at).not.toBeNull();

    invalidateModelProfileCache();
    const loaded = await loadModelProfile(engine, "kanzlei-a");
    expect(loaded).toEqual(saved);

    const rows = await engine.executeRaw<{ t: string; federated: unknown }>(
      `SELECT jsonb_typeof(config -> 'model_profile') AS t, config -> 'federated' AS federated
         FROM sources WHERE id = 'kanzlei-a'`
    );
    expect(rows[0]!.t).toBe("object");
    expect(rows[0]!.federated).toBe(false);
  });

  test("a second save merges with the stored profile", async () => {
    await saveModelProfile(engine, "kanzlei-a", { chat: "deep" }, null);
    const second = await saveModelProfile(engine, "kanzlei-a", { erfassung: "utility" }, null);
    expect(second.areas).toMatchObject({ chat: "deep", erfassung: "utility" });
  });

  test("an invalid update is rejected and nothing is stored", async () => {
    await expect(
      saveModelProfile(engine, "kanzlei-a", { fristen: "utility" }, null)
    ).rejects.toThrow(ModelProfileValidationError);
    invalidateModelProfileCache();
    expect(await loadModelProfile(engine, "kanzlei-a")).toEqual(defaultModelProfile());
  });

  test("saving for an unknown source fails instead of silently dropping", async () => {
    await expect(saveModelProfile(engine, "ghost", { chat: "deep" }, null)).rejects.toThrow(
      /Unknown source/
    );
  });

  test("resolveSpecialistTier applies the tenant's profile only to that tenant", async () => {
    await saveModelProfile(engine, "kanzlei-a", { fristen: "deep" }, null);
    expect(await resolveSpecialistTier(engine, "kanzlei-a", "deadline-validator", "utility")).toBe(
      "deep"
    );
    expect(await resolveSpecialistTier(engine, "default", "deadline-validator", "utility")).toBe(
      "reasoning"
    );
    expect(await resolveSpecialistTier(engine, "kanzlei-a", "on-scanner", "utility")).toBe(
      "utility"
    );
  });

  test("dashboard view names the resolved model and price for every choice", async () => {
    const view = await buildModelProfileView(engine, defaultModelProfile());
    expect(view.areas.map((a) => a.id)).toEqual([...MODEL_AREAS]);
    const fristen = view.areas.find((a) => a.id === "fristen")!;
    expect(fristen.options.map((o) => o.choice)).toEqual(["auto", "reasoning", "deep"]);
    expect(fristen.options.find((o) => o.choice === "deep")!.models).toEqual([TIER_DEFAULTS.deep]);
    const chatAuto = view.areas.find((a) => a.id === "chat")!.options[0]!;
    expect(chatAuto.models).toEqual([TIER_DEFAULTS.reasoning, TIER_DEFAULTS.deep]);
    expect(view.pricing[TIER_DEFAULTS.deep]).toMatchObject({ input: expect.any(Number) });
    const quality = view.areas.find((a) => a.id === "qualitaet")!;
    expect(quality).toMatchObject({ locked: true, choice: "auto" });
  });
});

// ── Subagent handler: the specialist really runs on the picked model ────

class RecordingClient implements MessagesClient {
  public models: string[] = [];
  async create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    this.models.push(params.model);
    return {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: params.model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      content: [{ type: "text", text: "ok", citations: null }],
    } as unknown as Anthropic.Message;
  }
}

async function runSpecialist(specialist: string, sourceId: string): Promise<string> {
  // allowed_tools pinned to a stub so the test needs no brain tool registry;
  // model selection does not depend on the tools.
  const input = {
    prompt: "Prüfe die Frist.",
    subagent_def: specialist,
    _source_id: sourceId,
    allowed_tools: ["noop"],
  };
  const job = await queue.add("subagent", input, {}, { allowProtectedSubmit: true });
  const ctx: MinionJobContext = {
    id: job.id,
    name: job.name,
    data: input,
    attempts_made: 0,
    signal: new AbortController().signal,
    shutdownSignal: new AbortController().signal,
    async updateProgress() {},
    async updateTokens() {},
    async log() {},
    async isActive() {
      return true;
    },
    async readInbox() {
      return [];
    },
  };
  const client = new RecordingClient();
  const noop: ToolDef = {
    name: "noop",
    description: "no-op",
    input_schema: { type: "object", properties: {}, required: [] },
    idempotent: true,
    async execute() {
      return {};
    },
  };
  await makeSubagentHandler({ engine, client, toolRegistry: [noop] })(ctx);
  expect(client.models.length).toBeGreaterThan(0);
  return client.models[0]!;
}

function bareModel(id: string): string {
  return id.slice(id.indexOf(":") + 1);
}

describe("subagent handler honours the profile", () => {
  test("default profile: deadline-validator is raised to the fristen floor", async () => {
    expect(await runSpecialist("deadline-validator", "kanzlei-a")).toBe(
      bareModel(TIER_DEFAULTS.reasoning)
    );
  });

  test("fristen pinned to deep: deadline-validator runs on the deep model", async () => {
    await saveModelProfile(engine, "kanzlei-a", { fristen: "deep" }, null);
    expect(await runSpecialist("deadline-validator", "kanzlei-a")).toBe(
      bareModel(TIER_DEFAULTS.deep)
    );
  });

  test("erfassung pinned to utility: forensic-analyst runs on the utility model", async () => {
    await saveModelProfile(engine, "kanzlei-a", { erfassung: "utility" }, null);
    expect(await runSpecialist("forensic-analyst", "kanzlei-a")).toBe(
      bareModel(TIER_DEFAULTS.utility)
    );
  });
});
