// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));

import { handleLegalChatMessage } from "./actions";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

const CASE_SLUG = "legal/cases/2026-014";
const LAWYER_PHONE = "+4915512345";

function identity(role: WhatsAppIdentity["role"] = "lawyer"): WhatsAppIdentity {
  return {
    id: "id-1",
    orgId: "org-a",
    phoneHash: "hash",
    matterScope: [CASE_SLUG],
    status: "active",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phone: LAWYER_PHONE,
    brainId: "org-a",
    role,
  };
}

// Minimal in-memory engine: enough for resolveAuthorizedCase, the client
// contact lookup, and the create-pending-action → confirm-with-"ja" round
// trip that createPendingAction/findLatestPendingAction/executeAction use.
let pages: Record<string, Record<string, unknown>>;

function seedPages() {
  pages = {
    [CASE_SLUG]: {
      slug: CASE_SLUG,
      title: "Müller ./. Schmidt",
      type: "legal_case",
      frontmatter: {
        case_number: "2026-014",
        deadlines: [
          {
            id: "d1",
            title: "Berufung",
            due_date: "2026-10-05",
            status: "pending",
            is_notfrist: true,
            created_by_id: "u-other",
          },
          { id: "d2", title: "Stellungnahme", due_date: "2026-10-09", status: "pending" },
        ],
      },
    },
  };
}

beforeEach(() => {
  seedPages();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        const slug = String(body.slug);
        const existing = pages[slug];
        const frontmatter =
          body.merge && existing
            ? { ...(existing.frontmatter as object), ...(body.frontmatter as object) }
            : (body.frontmatter ?? {});
        pages[slug] = { ...(existing ?? {}), ...body, frontmatter };
        return new Response(JSON.stringify({ slug }), { status: 200 });
      }
      const listMatch = u.match(/\/api\/pages\?type=([^&]+)/);
      if (listMatch) {
        const type = decodeURIComponent(listMatch[1]);
        return new Response(JSON.stringify(Object.values(pages).filter((p) => p.type === type)), {
          status: 200,
        });
      }
      const getMatch = u.match(/\/api\/pages\/(.+)$/);
      if (getMatch) {
        const slug = decodeURIComponent(getMatch[1]);
        const page = pages[slug];
        return page
          ? new Response(JSON.stringify(page), { status: 200 })
          : new Response("{}", { status: 404 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    })
  );
});

function send(
  text: string,
  role: WhatsAppIdentity["role"] = "lawyer",
  messageId = `m-${Math.random()}`
) {
  return handleLegalChatMessage({
    sender: identity(role),
    fromPhone: LAWYER_PHONE,
    messageId,
    text,
  });
}

function deadline(id: string): Record<string, unknown> {
  const fm = pages[CASE_SLUG].frontmatter as { deadlines: Array<Record<string, unknown>> };
  return fm.deadlines.find((d) => d.id === id)!;
}

describe("WhatsApp deadline commands follow the dashboard deadline rules", () => {
  it("does not complete a Notfrist — second check required", async () => {
    await send("frist erledigt akt 2026-014: Berufung");
    const reply = await send("ja");
    expect(reply).toMatch(/Vier-Augen/);
    expect(deadline("d1").status).toBe("pending");
  });

  it("does not complete a Notfrist marked only by second_check_required", async () => {
    const d1 = deadline("d1");
    delete d1.is_notfrist;
    d1.second_check_required = true;
    await send("frist erledigt akt 2026-014: Berufung");
    const reply = await send("ja");
    expect(reply).toMatch(/Vier-Augen/);
    expect(deadline("d1").status).toBe("pending");
  });

  it("completes an ordinary deadline with a server-stamped history entry", async () => {
    await send("frist erledigt akt 2026-014: Stellungnahme");
    await send("ja");
    const d2 = deadline("d2");
    expect(d2.status).toBe("done");
    expect((d2.audit_log as Array<Record<string, unknown>>).at(-1)).toMatchObject({
      action: "complete",
      server: true,
    });
  });

  it("refuses cancelling a Notfrist without a written reason (not possible via WhatsApp)", async () => {
    await send("frist streichen akt 2026-014: Berufung");
    const reply = await send("ja");
    expect(reply).toMatch(/nicht geändert/);
    expect(deadline("d1").status).toBe("pending");
  });

  it("refuses moving a Notfrist from the assistant role", async () => {
    await send("frist verschieben akt 2026-014: Berufung auf 08.10.2026", "assistant");
    const reply = await send("ja", "assistant");
    expect(reply).toMatch(/nicht geändert/);
    expect(deadline("d1").due_date).toBe("2026-10-05");
  });
});
