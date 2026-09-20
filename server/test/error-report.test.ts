import { describe, test, expect, afterEach } from "bun:test";
import { withEnv } from "./helpers/with-env.ts";
import {
  parseDsn,
  buildEnvelope,
  reportError,
  _resetErrorReportForTests,
} from "../src/core/error-report.ts";

afterEach(() => {
  _resetErrorReportForTests();
});

describe("error-report", () => {
  test("parses a Sentry DSN into the envelope endpoint", () => {
    expect(parseDsn("https://abc123@o42.ingest.sentry.io/77")).toEqual({
      endpoint: "https://o42.ingest.sentry.io/api/77/envelope/",
      publicKey: "abc123",
    });
    expect(parseDsn("")).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });

  test("envelope carries type, message and tags — no payloads", () => {
    const env = buildEnvelope(new TypeError("boom"), { kind: "job_failed", job_id: 7 });
    const [, itemHeader, event] = env.split("\n");
    expect(JSON.parse(itemHeader!)).toEqual({ type: "event" });
    const e = JSON.parse(event!);
    expect(e.exception.values[0].type).toBe("TypeError");
    expect(e.exception.values[0].value).toBe("boom");
    expect(e.tags).toMatchObject({ component: "engine", kind: "job_failed", job_id: "7" });
  });

  test("is a silent no-op without a DSN", () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("");
    }) as unknown as typeof fetch;
    try {
      reportError(new Error("x"));
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  test("posts to Sentry when a DSN is set", async () => {
    await withEnv({ SENTRY_DSN: "https://k@example.test/9" }, async () => {
      const original = globalThis.fetch;
      let url = "";
      globalThis.fetch = (async (u: string) => {
        url = u;
        return new Response("");
      }) as unknown as typeof fetch;
      try {
        reportError(new Error("x"), { kind: "t" });
        await new Promise((r) => setTimeout(r, 0));
        expect(url).toBe("https://example.test/api/9/envelope/");
      } finally {
        globalThis.fetch = original;
      }
    });
  });
});
