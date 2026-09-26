import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPortalMessages, portalMessageSlugPrefix } from "./portal-messages";

const ENGINE = "http://localhost:3001";

describe("listPortalMessages", () => {
  beforeEach(() => {
    vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
  });

  it("reads the matter's messages by prefix, oldest first, with text and sender", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.includes("/api/pages?")) {
          return new Response(
            JSON.stringify([
              {
                slug: "portal-message/cases/a/2",
                content: "",
                frontmatter: {
                  sender: "lawyer",
                  message: "Wir melden uns.",
                  created_at: "2026-09-19T10:00:00Z",
                },
              },
              {
                slug: "portal-message/cases/a/1",
                content: "",
                frontmatter: { sender: "client", created_at: "2026-09-19T09:00:00Z" },
              },
              {
                slug: "portal-message/cases/a/0",
                content: "",
                frontmatter: { status: "tombstoned", message: "gelöscht" },
              },
            ]),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({ slug: "portal-message/cases/a/1", content: "Alte Frage" }),
          {
            status: 200,
          }
        );
      })
    );

    const messages = await listPortalMessages({}, "cases/a");

    expect(urls[0]).toContain(
      `slug_prefix=${encodeURIComponent(portalMessageSlugPrefix("cases/a"))}`
    );
    expect(messages).toEqual([
      {
        id: "portal-message/cases/a/1",
        text: "Alte Frage",
        sender: "client",
        createdAt: "2026-09-19T09:00:00Z",
      },
      {
        id: "portal-message/cases/a/2",
        text: "Wir melden uns.",
        sender: "lawyer",
        createdAt: "2026-09-19T10:00:00Z",
      },
    ]);
  });
});

describe("listPortalMessages — KI-Entwürfe", () => {
  it("hands out the reviewed-AI label, never a pending draft", async () => {
    vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                slug: "portal-message/cases/a/1",
                frontmatter: {
                  sender: "client",
                  message: "Wie stehen meine Chancen?",
                  created_at: "2026-09-19T09:00:00Z",
                  ai_draft: { text: "ENTWURF-GEHEIM", status: "pending", grounded: true },
                },
              },
              {
                slug: "portal-message/cases/a/2",
                frontmatter: {
                  sender: "lawyer",
                  message: "Geprüfte Antwort",
                  ai_assisted: true,
                  created_at: "2026-09-19T10:00:00Z",
                },
              },
            ]),
            { status: 200 }
          )
      )
    );
    const messages = await listPortalMessages({}, "cases/a");
    expect(JSON.stringify(messages)).not.toContain("ENTWURF-GEHEIM");
    expect(messages[0]!.aiAssisted).toBeUndefined();
    expect(messages[1]!.aiAssisted).toBe(true);
  });
});
