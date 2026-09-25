// @vitest-environment node

/**
 * Per-firm DMS configuration: the API key is stored encrypted, never returned
 * in the public shape, and each firm only ever reads its own row.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.SUBSUMIO_ENCRYPTION_KEY = "test-encryption-key-32-bytes-long!!";
});

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine", enginePatchPage: vi.fn() }));
vi.mock("@/lib/schema-init", () => ({ createSchemaInit: () => async () => undefined }));

type Row = Record<string, unknown>;
const rows = new Map<string, Row>();
let poolAvailable = true;

/** Minimal in-memory stand-in for the four statements the store issues. */
const fakePool = {
  async query(sql: string, params: unknown[] = []) {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("SELECT * FROM subsumio_dms_configs WHERE brain_id = $1")) {
      const r = rows.get(params[0] as string);
      return { rows: r ? [r] : [] };
    }
    if (s.startsWith("SELECT api_key_enc FROM subsumio_dms_configs")) {
      const r = rows.get(params[0] as string);
      return { rows: r ? [{ api_key_enc: r.api_key_enc }] : [] };
    }
    if (s.startsWith("INSERT INTO subsumio_dms_configs")) {
      const [brainId, provider, baseUrl, keyEnc, site, drive, box, userId] = params as string[];
      const prev = rows.get(brainId);
      const row: Row = {
        brain_id: brainId,
        provider,
        base_url: baseUrl,
        api_key_enc: keyEnc ?? prev?.api_key_enc ?? "",
        sharepoint_site_id: site,
        sharepoint_drive_id: drive,
        box_folder_id: box,
        created_by: prev?.created_by ?? userId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };
      rows.set(brainId, row);
      return { rows: [row] };
    }
    if (s.startsWith("DELETE FROM subsumio_dms_configs")) {
      const had = rows.delete(params[0] as string);
      return { rows: [], rowCount: had ? 1 : 0 };
    }
    throw new Error(`unexpected SQL: ${s}`);
  },
};

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => (poolAvailable ? fakePool : null),
}));

import {
  deleteDmsConfig,
  getDmsConfig,
  getDmsSettingsForBrain,
  saveDmsConfig,
  validateDmsBaseUrl,
} from "./config-store";

const SECRET = "super-secret-dms-token-123";

describe("DMS config store", () => {
  beforeEach(() => {
    rows.clear();
    poolAvailable = true;
  });

  test("the key is stored encrypted and never part of the public shape", async () => {
    const saved = await saveDmsConfig("brain-a", "u1", {
      provider: "imanager",
      baseUrl: "https://dms-a.example.com",
      apiKey: SECRET,
    });
    const stored = rows.get("brain-a")!;
    expect(String(stored.api_key_enc)).toMatch(/^sbenc:/);
    expect(String(stored.api_key_enc)).not.toContain(SECRET);
    expect(JSON.stringify(saved)).not.toContain(SECRET);
    expect(saved).toMatchObject({ provider: "imanager", hasApiKey: true });
    expect(saved).not.toHaveProperty("apiKey");
    const pub = await getDmsConfig("brain-a");
    expect(JSON.stringify(pub)).not.toContain(SECRET);
    expect(JSON.stringify(pub)).not.toContain(String(stored.api_key_enc));
  });

  test("the server-side settings decrypt the key for the firm's connector", async () => {
    await saveDmsConfig("brain-a", "u1", {
      provider: "netdocuments",
      baseUrl: "https://dms-a.example.com",
      apiKey: SECRET,
    });
    const settings = await getDmsSettingsForBrain("brain-a");
    expect(settings).toEqual(
      expect.objectContaining({
        provider: "netdocuments",
        baseUrl: "https://dms-a.example.com",
        apiKey: SECRET,
      })
    );
  });

  test("each firm only reads its own configuration", async () => {
    await saveDmsConfig("brain-a", "u1", {
      provider: "imanager",
      baseUrl: "https://dms-a.example.com",
      apiKey: "key-a",
    });
    expect(await getDmsSettingsForBrain("brain-b")).toBeNull();
    expect(await getDmsConfig("brain-b")).toBeNull();
  });

  test("an update without a new key keeps the stored one", async () => {
    await saveDmsConfig("brain-a", "u1", {
      provider: "imanager",
      baseUrl: "https://dms-a.example.com",
      apiKey: SECRET,
    });
    await saveDmsConfig("brain-a", "u2", {
      provider: "imanager",
      baseUrl: "https://dms-a2.example.com",
      apiKey: null,
    });
    const settings = await getDmsSettingsForBrain("brain-a");
    expect(settings?.apiKey).toBe(SECRET);
    expect(settings?.baseUrl).toBe("https://dms-a2.example.com");
  });

  test("a first setup without a key is refused", async () => {
    await expect(
      saveDmsConfig("brain-a", "u1", { provider: "imanager", baseUrl: "https://x.example.com" })
    ).rejects.toThrow("dms_api_key_required");
    expect(rows.has("brain-a")).toBe(false);
  });

  test("an unreadable stored key fails closed (throws instead of returning a config)", async () => {
    rows.set("brain-a", {
      brain_id: "brain-a",
      provider: "imanager",
      base_url: "https://x.example.com",
      api_key_enc: "sbenc:not-a-valid-ciphertext",
      updated_at: new Date().toISOString(),
    });
    await expect(getDmsSettingsForBrain("brain-a")).rejects.toThrow("dms_config_unreadable");
  });

  test("delete removes the firm's credentials", async () => {
    await saveDmsConfig("brain-a", "u1", { provider: "box", apiKey: "k" });
    expect(await deleteDmsConfig("brain-a")).toBe(true);
    expect(await getDmsSettingsForBrain("brain-a")).toBeNull();
    expect(await deleteDmsConfig("brain-a")).toBe(false);
  });

  test("without a database no firm config exists (and saving fails loudly)", async () => {
    poolAvailable = false;
    expect(await getDmsSettingsForBrain("brain-a")).toBeNull();
    await expect(saveDmsConfig("brain-a", "u1", { provider: "box", apiKey: "k" })).rejects.toThrow(
      "dms_config_database_not_configured"
    );
  });
});

describe("validateDmsBaseUrl", () => {
  test("accepts public https endpoints and normalises the trailing slash", () => {
    expect(validateDmsBaseUrl("https://dms.example.com/api/")).toEqual({
      ok: true,
      url: "https://dms.example.com/api",
    });
  });

  test.each([
    ["http://dms.example.com", "https_required"],
    ["not a url", "invalid_url"],
    ["https://user:pw@dms.example.com", "credentials_in_url"],
    ["https://localhost", "private_host"],
    ["https://127.0.0.1", "private_host"],
    ["https://10.0.0.5", "private_host"],
    ["https://192.168.1.10", "private_host"],
    ["https://172.20.0.1", "private_host"],
    ["https://169.254.169.254", "private_host"],
    ["https://[::1]", "private_host"],
    ["https://fileserver.internal", "private_host"],
    ["https://intranet", "private_host"],
  ])("rejects %s (%s)", (url, error) => {
    expect(validateDmsBaseUrl(url)).toEqual({ ok: false, error });
  });
});
