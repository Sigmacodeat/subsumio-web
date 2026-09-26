// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MS365_CLIENT_ID = "cid";
  process.env.MS365_CLIENT_SECRET = "csecret";
  process.env.MS365_TENANT_ID = "tid";
});

import {
  createCalendarEvent,
  graphMailLinkPath,
  isAppGraphFirm,
  isMsGraphConfigured,
  syncMail,
} from "./msgraph";

const calls: string[] = [];

beforeEach(() => {
  process.env.MS365_MAILBOX = "kanzlei@firma.example";
  process.env.MS365_BRAIN_ID = "brain-a";
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("login.microsoftonline.com")) {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      return Response.json({ value: [], id: "ev1" });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("msgraph app access", () => {
  it("is bound to exactly one firm", () => {
    expect(isAppGraphFirm("brain-a")).toBe(true);
    expect(isAppGraphFirm("brain-b")).toBe(false);
    process.env.MS365_BRAIN_ID = "";
    expect(isAppGraphFirm("brain-a")).toBe(false);
  });

  it("needs the service mailbox to count as configured", () => {
    expect(isMsGraphConfigured()).toBe(true);
    process.env.MS365_MAILBOX = "";
    expect(isMsGraphConfigured()).toBe(false);
  });

  it("uses /users/<mailbox> instead of /me for app tokens", async () => {
    await syncMail();
    await createCalendarEvent({ subject: "x", start: "2026-01-01T10:00", end: "2026-01-01T11:00" });
    const graph = calls.filter((c) => c.startsWith("https://graph.microsoft.com"));
    expect(graph).toHaveLength(2);
    for (const c of graph) {
      expect(c).toContain("/v1.0/users/kanzlei%40firma.example/");
      expect(c).not.toContain("/me/");
    }
  });

  it.each([
    "/users/x/messages",
    "https://graph.microsoft.com/v1.0/users/other@firma.example/mailFolders/Inbox/messages",
    "https://graph.microsoft.com/v1.0/users/kanzlei@firma.example/messages",
    "https://graph.microsoft.com/v1.0/users/kanzlei@firma.example/mailFolders/../../other/messages",
    "https://graph.microsoft.com/v1.0/users/kanzlei@firma.example/mailFolders/%2e%2e/x",
    "https://evil.example/v1.0/users/kanzlei@firma.example/mailFolders/Inbox/messages",
    "http://graph.microsoft.com/v1.0/users/kanzlei@firma.example/mailFolders/Inbox/messages",
    "https://graph.microsoft.com:8443/v1.0/users/kanzlei@firma.example/mailFolders/Inbox/x",
    "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages",
  ])("refuses the link %s", (link) => {
    expect(() => graphMailLinkPath(link)).toThrow();
  });

  it("accepts the mailbox's own paging links and never calls Graph for a foreign one", async () => {
    expect(
      graphMailLinkPath(
        "https://graph.microsoft.com/v1.0/users/kanzlei@firma.example/mailFolders/Inbox/messages?$skip=50"
      )
    ).toBe("/users/kanzlei@firma.example/mailFolders/Inbox/messages?$skip=50");
    expect(
      graphMailLinkPath(
        "https://graph.microsoft.com/v1.0/users('kanzlei%40firma.example')/mailFolders('Inbox')/messages/delta?$deltatoken=abc"
      )
    ).toContain("/mailFolders('Inbox')/messages/delta?$deltatoken=abc");
    await expect(syncMail({ deltaLink: "/users/x/messages" })).rejects.toThrow();
    expect(calls.filter((c) => c.startsWith("https://graph.microsoft.com"))).toHaveLength(0);
  });
});
