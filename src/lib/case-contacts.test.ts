import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { contactSlugFor, ensureCaseContacts, normalizeContactName } from "./case-contacts";

const headers = { "x-subsumio-source": "brain_a" };

describe("ensureCaseContacts", () => {
  let posted: Array<Record<string, unknown>>;
  beforeEach(() => {
    posted = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          posted.push(body);
          return new Response(JSON.stringify({ slug: body.slug }), { status: 200 });
        }
        return new Response(
          JSON.stringify([
            {
              slug: "contact/bau-ag-1",
              title: "Bau AG",
              frontmatter: { name: "Bau AG", role: "opponent" },
            },
          ]),
          { status: 200 }
        );
      })
    );
  });

  it("reuses an existing contact by normalised name and creates the missing ones", async () => {
    const links = await ensureCaseContacts(headers, {
      client_name: "Franz Huber",
      opponent_name: "BAU  AG",
      court_name: "LG Wien",
    });
    expect(links.opponent_slugs).toEqual(["contact/bau-ag-1"]);
    expect(links.client_slug).toMatch(/^contact\/franz-huber-/);
    expect(links.court_slug).toMatch(/^contact\/lg-wien-/);
    expect(posted.map((p) => p.frontmatter)).toEqual([
      expect.objectContaining({ type: "legal_contact", role: "client", name: "Franz Huber" }),
      expect.objectContaining({ type: "legal_contact", role: "court", name: "LG Wien" }),
    ]);
  });

  it("leaves already linked parties alone", async () => {
    const links = await ensureCaseContacts(headers, {
      client_name: "Franz Huber",
      client_slug: "contact/franz-huber-x",
      opponent_name: "Bau AG",
      opponent_slugs: ["contact/bau-ag-1"],
    });
    expect(links).toEqual({});
    expect(posted).toHaveLength(0);
  });

  it("never throws when the engine is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      })
    );
    await expect(ensureCaseContacts(headers, { client_name: "X" })).resolves.toEqual({});
  });

  it("normalises names and slugs like the contacts page", () => {
    expect(normalizeContactName("  Dr.  Anna   Müller ")).toBe("dr anna müller");
    expect(contactSlugFor("Müller & Co. GmbH", 1)).toBe("contact/müller-co-gmbh-1");
  });
});
