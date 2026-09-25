// @vitest-environment node
//
// Server-side Kanzlei settings: read from the firm's OWN brain with the
// trusted engine headers (API key + tenant source). The browser API client
// reached the engine without either, got a 401 and fell back to defaults —
// so the reminder cron never saw a firm's SMTP settings.
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({
    "x-subsumio-source": brainId,
    "x-subsumio-api-key": "k",
  }),
  firmBrainIdFor: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  isSmtpConfigured,
  KanzleiSettingsUnavailableError,
  loadKanzleiSettingsForBrain,
} from "./kanzlei-settings-server";
import { DEFAULT_KANZLEI_SETTINGS } from "./kanzlei-settings";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("loadKanzleiSettingsForBrain", () => {
  test("reads the firm's settings page with tenant + API-key headers", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        frontmatter: {
          smtpHost: "smtp.firm.test",
          smtpUser: "u",
          smtpPassword: "p",
          kanzleiName: "Kanzlei A",
        },
      })
    );
    const settings = await loadKanzleiSettingsForBrain("brain-a");
    expect(settings.smtpHost).toBe("smtp.firm.test");
    expect(settings.kanzleiName).toBe("Kanzlei A");
    expect(isSmtpConfigured(settings)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.test/api/pages/legal/settings/kanzlei");
    expect(init.headers).toMatchObject({
      "x-subsumio-source": "brain-a",
      "x-subsumio-api-key": "k",
    });
  });

  test("each firm is read from its own brain", async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const brain = (init.headers as Record<string, string>)["x-subsumio-source"];
      return Response.json({ frontmatter: { kanzleiName: `Kanzlei ${brain}` } });
    });
    const [a, b] = await Promise.all([
      loadKanzleiSettingsForBrain("a"),
      loadKanzleiSettingsForBrain("b"),
    ]);
    expect(a.kanzleiName).toBe("Kanzlei a");
    expect(b.kanzleiName).toBe("Kanzlei b");
  });

  test("404 (never saved) returns the defaults", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    const settings = await loadKanzleiSettingsForBrain("brain-a");
    expect(settings.stundensatz).toBe(DEFAULT_KANZLEI_SETTINGS.stundensatz);
    expect(isSmtpConfigured(settings)).toBe(false);
  });

  test("a 401 is an error, never silently 'SMTP not configured'", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(loadKanzleiSettingsForBrain("brain-a")).rejects.toBeInstanceOf(
      KanzleiSettingsUnavailableError
    );
  });

  test("a network failure is an error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(loadKanzleiSettingsForBrain("brain-a")).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("encrypted SMTP password (OPS-18)", () => {
  test("the stored cipher text is decrypted for sending, never returned raw", async () => {
    const { sealKanzleiSettingsFrontmatter } = await import("./kanzlei-settings-secrets");
    const fm = await sealKanzleiSettingsFrontmatter(
      { smtpHost: "smtp.firm.test", smtpUser: "u", smtpPassword: "p-secret" },
      null
    );
    fetchMock.mockResolvedValue(Response.json({ frontmatter: fm }));
    const settings = await loadKanzleiSettingsForBrain("brain-a");
    expect(settings.smtpPassword).toBe("p-secret");
    expect(isSmtpConfigured(settings)).toBe(true);
    expect(settings).not.toHaveProperty("smtpPasswordEnc");
  });
});
