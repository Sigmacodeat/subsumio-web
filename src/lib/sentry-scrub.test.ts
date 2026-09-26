// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubString, sentryPrivacyOptions } from "./sentry-scrub";

describe("scrubString", () => {
  it("masks e-mails, matter paths, query strings and tokens", () => {
    const s = scrubString(
      "GET https://app.example/api/pages/legal/cases/client-a-v-client-b?q=secret failed for alice-example@example.at, Bearer abc.def.ghi"
    );
    expect(s).not.toContain("client-a-v-client-b");
    expect(s).not.toContain("secret");
    expect(s).not.toContain("alice-example@example.at");
    expect(s).not.toContain("abc.def.ghi");
    expect(s).toContain("/api/pages/[redacted]");
    expect(s).toContain("[email]");
  });

  it("keeps harmless text", () => {
    expect(scrubString("Engine returned 503")).toBe("Engine returned 503");
  });
});

describe("scrubEvent", () => {
  const event = {
    event_id: "0123456789abcdef0123456789abcdef",
    message: "case read failed for /dashboard/cases/client-a-matter",
    transaction: "GET /api/cases/client-a-matter",
    exception: {
      values: [
        {
          type: "Error",
          value: "mail to bob-example@example.at bounced",
          stacktrace: { frames: [{ filename: "/app/.next/server/app/api/cases/[slug]/route.js" }] },
        },
      ],
    },
    request: {
      url: "https://app.example/portal/abcdefghijklmnopqrstuvwxyz0123456789?token=x",
      query_string: "token=x",
      cookies: { sb_session: "s" },
      data: { note: "privileged" },
      headers: { Cookie: "sb_session=s", Authorization: "Bearer t", "User-Agent": "UA" },
    },
    user: { id: "u_1", email: "carol-example@example.at", ip_address: "203.0.113.4" },
    contexts: {
      trace: { trace_id: "fedcba9876543210fedcba9876543210", span_id: "0123456789abcdef" },
    },
  };

  it("removes request body, cookies, query and sensitive headers; reduces the user to its id", () => {
    const out = scrubEvent(event) as typeof event;
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.data).toBeUndefined();
    expect(out.request.query_string).toBeUndefined();
    expect(out.request.headers).toEqual({ "User-Agent": "UA" });
    expect(out.user).toEqual({ id: "u_1" });
  });

  it("masks slugs, e-mails and URLs everywhere but keeps ids and stack frames", () => {
    const out = scrubEvent(event) as typeof event;
    const json = JSON.stringify(out);
    expect(json).not.toContain("client-a-matter");
    expect(json).not.toContain("bob-example@example.at");
    expect(json).not.toContain("carol-example");
    expect(json).not.toContain("token=x");
    expect(json).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(out.event_id).toBe(event.event_id);
    expect(out.contexts.trace.trace_id).toBe(event.contexts.trace.trace_id);
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe(
      "/app/.next/server/app/api/cases/[slug]/route.js"
    );
  });

  it("does not mutate the original event", () => {
    scrubEvent(event);
    expect(event.request.cookies).toEqual({ sb_session: "s" });
  });
});

describe("scrubBreadcrumb / options", () => {
  it("scrubs fetch breadcrumbs", () => {
    const b = scrubBreadcrumb({
      category: "fetch",
      data: { url: "/api/pages/legal/client-x?x=1", status_code: 404 },
    });
    expect(JSON.stringify(b)).not.toContain("client-x");
  });

  it("disables default PII and wires all hooks", () => {
    expect(sentryPrivacyOptions.sendDefaultPii).toBe(false);
    expect(sentryPrivacyOptions.beforeSend).toBe(scrubEvent);
    expect(sentryPrivacyOptions.beforeSendTransaction).toBe(scrubEvent);
    expect(sentryPrivacyOptions.beforeBreadcrumb).toBe(scrubBreadcrumb);
  });
});
