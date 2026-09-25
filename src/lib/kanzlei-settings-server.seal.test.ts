// @vitest-environment node
//
// A plaintext SMTP password saved before encryption is sealed on the first
// server-side read: encrypted into smtpPasswordEnc, plaintext removed, once,
// even under parallel reads, and recorded in the audit log.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUBSUMIO_ENCRYPTION_KEY = "test-key-for-kanzlei-settings-seal-32b";
});

const audits = vi.hoisted(() => [] as Array<{ action: string; opts?: Record<string, unknown> }>);

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  enginePatchPage: async (headers: Record<string, string>, body: Record<string, unknown>) =>
    fetch("http://engine.test/api/pages", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, merge: true }),
    }),
  firmBrainIdFor: vi.fn(),
}));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (action: string, _t: string, opts?: Record<string, unknown>) => {
    audits.push({ action, opts });
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { loadKanzleiSettingsForBrain, sealLegacySmtpPassword } from "./kanzlei-settings-server";
import { decrypt } from "./encryption";

/** Fake engine: one settings page per brain; merge writes drop null keys. */
const store = new Map<string, Record<string, unknown>>();
let writes = 0;

beforeEach(() => {
  store.clear();
  writes = 0;
  audits.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const brain = (init?.headers as Record<string, string>)["x-subsumio-source"];
      await new Promise((r) => setTimeout(r, 1));
      if (init?.method === "POST") {
        writes++;
        const body = JSON.parse(String(init.body)) as { frontmatter: Record<string, unknown> };
        const next = { ...(store.get(brain) ?? {}) };
        for (const [k, v] of Object.entries(body.frontmatter)) {
          if (v === null || v === undefined) delete next[k];
          else next[k] = v;
        }
        store.set(brain, next);
        return Response.json({ ok: true });
      }
      const fm = store.get(brain);
      if (!fm) return new Response("not found", { status: 404 });
      return Response.json({ slug: "legal/settings/kanzlei", frontmatter: { ...fm } });
    })
  );
});

describe("sealing a legacy plaintext SMTP password", () => {
  test("the first server read encrypts it and removes the plaintext", async () => {
    store.set("brain-a", { smtpHost: "smtp.k.test", smtpUser: "u", smtpPassword: "geheim" });
    const settings = await loadKanzleiSettingsForBrain("brain-a");
    // The caller still gets the usable password.
    expect(settings.smtpPassword).toBe("geheim");

    const fm = store.get("brain-a")!;
    expect(fm).not.toHaveProperty("smtpPassword");
    expect(String(fm.smtpPasswordEnc)).toMatch(/^sbenc:/);
    expect(JSON.stringify(fm)).not.toContain("geheim");
    expect(await decrypt(fm.smtpPasswordEnc as string)).toBe("geheim");
    expect(fm.version).toBe(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action).toBe("settings.update");
    expect(audits[0]!.opts).toMatchObject({
      brainId: "brain-a",
      details: { change: "smtp_password_sealed", trigger: "read" },
    });

    // Afterwards reads are side-effect free.
    const before = writes;
    expect((await loadKanzleiSettingsForBrain("brain-a")).smtpPassword).toBe("geheim");
    expect(writes).toBe(before);
  });

  test("parallel reads seal exactly once", async () => {
    store.set("brain-a", { smtpPassword: "geheim" });
    await Promise.all([1, 2, 3, 4].map(() => loadKanzleiSettingsForBrain("brain-a")));
    expect(writes).toBe(1);
    expect(audits).toHaveLength(1);
    expect(store.get("brain-a")).not.toHaveProperty("smtpPassword");
  });

  test("an existing ciphertext is kept — only the leftover plaintext goes", async () => {
    store.set("brain-a", { smtpPasswordEnc: "sbenc:existing", smtpPassword: "alt" });
    expect(await sealLegacySmtpPassword("brain-a", { trigger: "migration" })).toBe("cleared");
    expect(store.get("brain-a")).toEqual({ smtpPasswordEnc: "sbenc:existing", version: 1 });
  });

  test("dry run reports without writing", async () => {
    store.set("brain-a", { smtpPassword: "geheim" });
    expect(await sealLegacySmtpPassword("brain-a", { trigger: "migration", dryRun: true })).toBe(
      "would_seal"
    );
    expect(writes).toBe(0);
    expect(store.get("brain-a")!.smtpPassword).toBe("geheim");
  });

  test("nothing to do without plaintext or without settings", async () => {
    store.set("brain-a", { smtpPasswordEnc: "sbenc:x" });
    expect(await sealLegacySmtpPassword("brain-a", { trigger: "migration" })).toBe("not_needed");
    expect(await sealLegacySmtpPassword("brain-b", { trigger: "migration" })).toBe("not_needed");
    expect(writes).toBe(0);
  });

  test("a failed write never fails the settings read", async () => {
    store.set("brain-a", { smtpHost: "h", smtpPassword: "geheim" });
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "POST" ? new Response("x", { status: 503 }) : inner(url, init)
      )
    );
    const settings = await loadKanzleiSettingsForBrain("brain-a");
    expect(settings.smtpPassword).toBe("geheim");
    expect(audits).toHaveLength(0);
  });
});
