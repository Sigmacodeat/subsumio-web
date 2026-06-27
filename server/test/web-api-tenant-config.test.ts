import { describe, expect, test } from "bun:test";
import { tenantModeRequired } from "../src/commands/web-api.ts";
import { withEnv } from "./helpers/with-env.ts";

describe("web API tenant-mode configuration", () => {
  test("honors the canonical Subsumio deployment variable", async () => {
    await withEnv(
      {
        SUBSUMIO_REQUIRE_TENANT: "true",
        GBRAIN_REQUIRE_TENANT: undefined,
        SIGMABRAIN_REQUIRE_TENANT: undefined,
      },
      () => {
        expect(tenantModeRequired()).toBe(true);
      }
    );
  });

  test("keeps both legacy variables compatible", async () => {
    await withEnv(
      {
        SUBSUMIO_REQUIRE_TENANT: undefined,
        GBRAIN_REQUIRE_TENANT: "true",
        SIGMABRAIN_REQUIRE_TENANT: undefined,
      },
      () => expect(tenantModeRequired()).toBe(true)
    );
    await withEnv(
      {
        SUBSUMIO_REQUIRE_TENANT: undefined,
        GBRAIN_REQUIRE_TENANT: undefined,
        SIGMABRAIN_REQUIRE_TENANT: "true",
      },
      () => expect(tenantModeRequired()).toBe(true)
    );
  });

  test("explicit options override environment configuration", async () => {
    await withEnv({ SUBSUMIO_REQUIRE_TENANT: "true" }, () => {
      expect(tenantModeRequired({ requireTenant: false })).toBe(false);
    });
    await withEnv({ SUBSUMIO_REQUIRE_TENANT: undefined }, () => {
      expect(tenantModeRequired({ requireTenant: true })).toBe(true);
    });
  });

  test("defaults to self-hosted compatibility mode", async () => {
    await withEnv(
      {
        SUBSUMIO_REQUIRE_TENANT: undefined,
        GBRAIN_REQUIRE_TENANT: undefined,
        SIGMABRAIN_REQUIRE_TENANT: undefined,
      },
      () => expect(tenantModeRequired()).toBe(false)
    );
  });
});
