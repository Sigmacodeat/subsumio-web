// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defaultModelPolicyForNewOrg, euRouteAvailable } from "./eu-routing";

describe("EU-Datenmodus-Voreinstellung", () => {
  it("DACH firms start EU-only when the operator confirmed an EU route", () => {
    const env = { SUBSUMIO_EU_MODEL_ROUTE: "1" };
    expect(defaultModelPolicyForNewOrg("AT", env)).toBe("eu_only");
    expect(defaultModelPolicyForNewOrg("de", env)).toBe("eu_only");
    expect(defaultModelPolicyForNewOrg("CH", env)).toBe("eu_only");
    expect(defaultModelPolicyForNewOrg(null, env)).toBe("any");
  });

  it("without an EU route the app stays usable (any)", () => {
    expect(defaultModelPolicyForNewOrg("AT", {})).toBe("any");
    expect(euRouteAvailable({})).toBe(false);
  });

  it("a deployment-wide EU-only switch counts as an EU route", () => {
    expect(euRouteAvailable({ SUBSUMIO_EU_ONLY: "true" })).toBe(true);
  });
});
