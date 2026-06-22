import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConnectorManager,
  CONNECTOR_REGISTRY,
  SUPPORTED_CONNECTORS,
} from "../src/core/ingestion/connectors/manager.ts";

describe("ConnectorManager admin API surface", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gbrain-conn-test-"));
    mkdirSync(join(tmpDir, ".gbrain"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("list() returns hasCredentials true when api_key is set", async () => {
    const mgr = new ConnectorManager(tmpDir);
    const registryPath = join(tmpDir, ".gbrain", "connectors.json");
    const entry = {
      service: "slack",
      enabled: true,
      config: { api_key: "xoxb-123", filter: "" },
    };
    writeFileSync(registryPath, JSON.stringify([entry]));

    const list = await mgr.list();
    expect(list).toHaveLength(1);
    expect(list[0].service).toBe("slack");
    expect(list[0].hasCredentials).toBe(true);
    expect(list[0].enabled).toBe(true);
  });

  test("list() returns hasCredentials true when client_id is set", async () => {
    const mgr = new ConnectorManager(tmpDir);
    const registryPath = join(tmpDir, ".gbrain", "connectors.json");
    const entry = {
      service: "google-drive",
      enabled: false,
      config: { client_id: "abc", client_secret: "def", filter: "" },
    };
    writeFileSync(registryPath, JSON.stringify([entry]));

    const list = await mgr.list();
    expect(list[0].hasCredentials).toBe(true);
    expect(list[0].enabled).toBe(false);
  });

  test("list() returns hasCredentials false when no secrets present", async () => {
    const mgr = new ConnectorManager(tmpDir);
    const registryPath = join(tmpDir, ".gbrain", "connectors.json");
    const entry = {
      service: "github",
      enabled: true,
      config: { filter: "" },
    };
    writeFileSync(registryPath, JSON.stringify([entry]));

    const list = await mgr.list();
    expect(list[0].hasCredentials).toBe(false);
  });

  test("setEnabled toggles connector state", async () => {
    const mgr = new ConnectorManager(tmpDir);
    const registryPath = join(tmpDir, ".gbrain", "connectors.json");
    const entry = {
      service: "github",
      enabled: true,
      config: { filter: "" },
    };
    writeFileSync(registryPath, JSON.stringify([entry]));

    await mgr.setEnabled("github", false);
    const list = await mgr.list();
    expect(list[0].enabled).toBe(false);

    await mgr.setEnabled("github", true);
    const list2 = await mgr.list();
    expect(list2[0].enabled).toBe(true);
  });

  test("setEnabled throws for unknown service", async () => {
    const mgr = new ConnectorManager(tmpDir);
    await expect(mgr.setEnabled("nonexistent", true)).rejects.toThrow("Connector not found");
  });

  test("CONNECTOR_REGISTRY exports all 15 connectors", () => {
    expect(SUPPORTED_CONNECTORS).toContain("google-drive");
    expect(SUPPORTED_CONNECTORS).toContain("gmail");
    expect(SUPPORTED_CONNECTORS).toContain("notion");
    expect(SUPPORTED_CONNECTORS).toContain("github");
    expect(SUPPORTED_CONNECTORS).toContain("slack");
    expect(SUPPORTED_CONNECTORS).toContain("calendar");
    expect(SUPPORTED_CONNECTORS).toContain("dropbox");
    expect(SUPPORTED_CONNECTORS).toContain("asana");
    expect(SUPPORTED_CONNECTORS).toContain("jira");
    // v0.43 legal vertical:
    expect(SUPPORTED_CONNECTORS).toContain("legal-judgements");
    expect(SUPPORTED_CONNECTORS).toContain("bea-import");
    // Microsoft 365 / Graph:
    expect(SUPPORTED_CONNECTORS).toContain("ms365-outlook");
    expect(SUPPORTED_CONNECTORS).toContain("ms365-onedrive");
    expect(SUPPORTED_CONNECTORS).toContain("ms365-sharepoint");
    expect(Object.keys(CONNECTOR_REGISTRY)).toHaveLength(15);
  });
});
