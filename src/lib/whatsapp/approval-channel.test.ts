// @vitest-environment node
/**
 * W3-5 / W2-3 / W3-6: WhatsApp Freigaben follow the dashboard's rules and
 * notifications reach the responsible lawyer, never the proposer or a client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/auth/store";
import type { WhatsAppIdentity } from "./types";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));

const { approvalNotificationRecipients, decideWhatsAppApproval, listDecidableApprovals } =
  await import("./approval-channel");

type Page = { slug: string; type: string; frontmatter: Record<string, unknown> };
const pages = new Map<string, Page>();
const writes: Array<Record<string, unknown>> = [];

function stubEngine(hidden: Set<string> = new Set()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }
      if (url.pathname === "/api/pages") {
        const list = [...pages.values()].filter((p) => p.type === url.searchParams.get("type"));
        return new Response(JSON.stringify({ pages: list }), { status: 200 });
      }
      const slug = decodeURIComponent(url.pathname.replace(/^\/api\/pages\//, ""));
      const page = pages.get(slug);
      // The engine hides walled matters from this caller (404).
      if (!page || hidden.has(slug)) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(page), { status: 200 });
    })
  );
}

function action(slug: string, fm: Record<string, unknown>): Page {
  return {
    slug,
    type: "agent_action",
    frontmatter: { type: "agent_action", status: "pending", action_type: "case_close", ...fm },
  };
}

const lawyer = { role: "lawyer" as const, email: "anwalt@k.example", userId: "u-l" };

beforeEach(() => {
  pages.clear();
  writes.length = 0;
  pages.set("legal/cases/open", { slug: "legal/cases/open", type: "legal_case", frontmatter: {} });
  pages.set("legal/cases/walled", {
    slug: "legal/cases/walled",
    type: "legal_case",
    frontmatter: {},
  });
  pages.set(
    "agent-action/a-own",
    action("agent-action/a-own", { proposed_by: "anwalt@k.example" })
  );
  pages.set(
    "agent-action/a-walled",
    action("agent-action/a-walled", {
      proposed_by: "sek@k.example",
      payload: { case_slug: "legal/cases/walled" },
    })
  );
  pages.set(
    "agent-action/a-ok",
    action("agent-action/a-ok", {
      proposed_by: "sek@k.example",
      payload: { case_slug: "legal/cases/open" },
    })
  );
  stubEngine(new Set(["legal/cases/walled"]));
});
afterEach(() => vi.unstubAllGlobals());

describe("listDecidableApprovals", () => {
  it("lists only Freigaben the person may decide: not their own, not behind a wall", async () => {
    const list = await listDecidableApprovals({}, lawyer);
    expect(list.map((p) => p.action_slug)).toEqual(["agent-action/a-ok"]);
  });

  it("lists nothing for an assistant", async () => {
    expect(await listDecidableApprovals({}, { role: "assistant", email: "sek@k.example" })).toEqual(
      []
    );
  });
});

describe("decideWhatsAppApproval", () => {
  const decide = (
    slug: string,
    decider = lawyer as Pick<WhatsAppIdentity, "role" | "email" | "userId">
  ) =>
    decideWhatsAppApproval({
      headers: {},
      brainId: "brain-1",
      actionSlug: slug,
      status: "approved",
      decider,
    });

  it("refuses an assistant (dashboard rule)", async () => {
    const res = await decide("agent-action/a-ok", {
      role: "assistant",
      email: "sek@k.example",
      userId: "u-s",
    });
    expect(res.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("refuses the proposer's own Freigabe (Vier-Augen)", async () => {
    const res = await decide("agent-action/a-own");
    expect(res).toEqual({ ok: false, message: expect.stringMatching(/Vier-Augen/) });
    expect(writes).toHaveLength(0);
  });

  it("treats a Freigabe of a walled matter as not found", async () => {
    expect((await decide("agent-action/a-walled")).ok).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("records the decision with the decider's account", async () => {
    expect(await decide("agent-action/a-ok")).toEqual({ ok: true });
    expect(writes[0]).toMatchObject({
      slug: "agent-action/a-ok",
      frontmatter: { status: "approved", decided_by: "anwalt@k.example", decided_via: "whatsapp" },
    });
  });
});

describe("approvalNotificationRecipients", () => {
  function id(userId: string, over: Partial<WhatsAppIdentity> = {}): WhatsAppIdentity {
    return {
      id: `wa-${userId}`,
      orgId: "org-1",
      brainId: "brain-1",
      phone: `+43664000${userId.length}${userId.charCodeAt(userId.length - 1)}`,
      phoneHash: userId,
      userId,
      userLinked: true,
      role: "lawyer",
      matterScope: "all",
      status: "active",
      verifiedAt: "x",
      createdAt: "x",
      updatedAt: "x",
      ...over,
    };
  }
  const users: Record<string, Partial<User>> = {
    "u-resp": { id: "u-resp", email: "resp@k.example", role: "lawyer" },
    "u-other": { id: "u-other", email: "other@k.example", role: "lawyer" },
    "u-sek": { id: "u-sek", email: "sek@k.example", role: "assistant" },
  };
  const deps = (fm: Record<string, unknown> | null) => ({
    listIdentities: async () => [
      id("u-resp"),
      id("u-other"),
      id("u-sek"),
      id("client", { role: "client" as const, userLinked: false }),
    ],
    getUser: async (uid: string) => (users[uid] as User) ?? null,
    readCase: async () => fm,
  });

  it("notifies the responsible lawyer of the matter only", async () => {
    const r = await approvalNotificationRecipients(
      { orgId: "org-1", caseSlug: "legal/cases/open" },
      deps({ own_lawyer_id: "resp@k.example" })
    );
    expect(r.map((x) => x.userId)).toEqual(["u-resp"]);
  });

  it("never the proposer and never someone behind the wall", async () => {
    const r = await approvalNotificationRecipients(
      { orgId: "org-1", caseSlug: "legal/cases/open", excludeUserId: "u-resp" },
      deps({
        own_lawyer_id: "u-resp",
        permissions: { allowed_users: ["u-resp", "u-other"], blocked_users: ["u-other"] },
      })
    );
    expect(r).toEqual([]);
  });

  it("nobody without a matter", async () => {
    expect(await approvalNotificationRecipients({ orgId: "org-1" }, deps({}))).toEqual([]);
  });
});
