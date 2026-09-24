/**
 * The web API must not start open in production: without
 * SUBSUMIO_WEB_API_KEY the API-key gate lets every request through.
 * Development / test runs stay keyless; an explicit escape hatch
 * (SUBSUMIO_ALLOW_OPEN_WEB_API=1) allows a deliberate open deployment.
 */
import { describe, expect, test } from "bun:test";
import { assertWebApiKeyConfigured } from "../src/commands/web-api.ts";

describe("assertWebApiKeyConfigured", () => {
  test("production without a key refuses to start", () => {
    expect(() => assertWebApiKeyConfigured(undefined, { NODE_ENV: "production" })).toThrow(
      /Refusing to start.*SUBSUMIO_WEB_API_KEY/
    );
    expect(() => assertWebApiKeyConfigured("", { NODE_ENV: "production" })).toThrow(
      /Refusing to start/
    );
  });

  test("production with a key starts", () => {
    expect(() => assertWebApiKeyConfigured("secret", { NODE_ENV: "production" })).not.toThrow();
  });

  test("production without a key starts only with the explicit escape hatch", () => {
    expect(() =>
      assertWebApiKeyConfigured(undefined, {
        NODE_ENV: "production",
        SUBSUMIO_ALLOW_OPEN_WEB_API: "1",
      })
    ).not.toThrow();
    expect(() =>
      assertWebApiKeyConfigured(undefined, {
        NODE_ENV: "production",
        SUBSUMIO_ALLOW_OPEN_WEB_API: "yes-please",
      })
    ).toThrow(/Refusing to start/);
  });

  test("development and test runs stay keyless", () => {
    expect(() => assertWebApiKeyConfigured(undefined, { NODE_ENV: "test" })).not.toThrow();
    expect(() => assertWebApiKeyConfigured(undefined, { NODE_ENV: "development" })).not.toThrow();
    expect(() => assertWebApiKeyConfigured(undefined, {})).not.toThrow();
  });
});
