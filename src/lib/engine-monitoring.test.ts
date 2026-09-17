import { afterEach, describe, expect, it, vi } from "vitest";
import { engineMonitoringHeaders } from "./engine";

describe("engineMonitoringHeaders", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never sends the 'default' tenant, which fail-closed mode rejects", () => {
    vi.stubEnv("SUBSUMIO_WEB_API_KEY", "key-123");
    const headers = engineMonitoringHeaders();
    expect(headers["x-subsumio-source"]).toBe("ops-health-probe");
    expect(headers["x-subsumio-source"]).not.toBe("default");
    expect(headers["x-subsumio-api-key"]).toBe("key-123");
  });

  it("takes the marker from the environment and omits a missing key", () => {
    vi.stubEnv("SUBSUMIO_MONITORING_SOURCE", "monitor-1");
    vi.stubEnv("SUBSUMIO_WEB_API_KEY", "");
    expect(engineMonitoringHeaders()).toEqual({ "x-subsumio-source": "monitor-1" });
  });
});
