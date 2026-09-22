// @vitest-environment node

import { describe, test, expect } from "vitest";
import { resolveFilingTransport, FilingTransportNotConfiguredError } from "./filing-transport";

describe("resolveFilingTransport", () => {
  test("without config → not configured, fail-closed", async () => {
    const t = resolveFilingTransport("beA", undefined);
    const s = await t.status();
    expect(s.configured).toBe(false);
    expect(s.reachable).toBe(false);
    await expect(
      t.send({ filingId: "x", xml: "<x/>", court: "BGH", priority: "normal" })
    ).rejects.toThrow(FilingTransportNotConfiguredError);
  });

  test("endpoint without apiKey → not configured", async () => {
    const t = resolveFilingTransport("ERV", { endpoint: "https://x.test" });
    expect((await t.status()).configured).toBe(false);
  });

  test("full config → HTTP adapter", async () => {
    const t = resolveFilingTransport("beA", {
      endpoint: "https://mw.test",
      apiKey: "k",
    });
    const s = await t.status();
    expect(s.configured).toBe(true);
    expect(s.reachable).toBe(false); // endpoint unreachable in test
  });
});
