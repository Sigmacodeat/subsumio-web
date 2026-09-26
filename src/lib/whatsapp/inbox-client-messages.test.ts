import { describe, expect, it } from "vitest";
import { clientConversationMessages } from "./inbox-client-messages";
import type { BrainPage } from "@/lib/types";

const page = (slug: string, fm: Record<string, unknown>) =>
  ({ slug, title: slug, content: "", frontmatter: fm }) as unknown as BrainPage;

// W3-11: client messages appear in the inbox; firm commands stay out of this list.
describe("clientConversationMessages", () => {
  it("keeps inbound client WhatsApp messages with sender hash and matter", () => {
    const out = clientConversationMessages([
      page("legal/conversations/whatsapp/a", {
        channel: "whatsapp",
        direction: "inbound",
        role: "client",
        phone_hash: "h1",
        actor_name: "Max",
        normalized_text: "Anbei die Vollmacht",
        created_at: "2026-09-24T10:00:00.000Z",
        case_slug: "legal/cases/a",
      }),
      page("legal/conversations/whatsapp/b", {
        channel: "whatsapp",
        direction: "inbound",
        role: "lawyer",
        phone_hash: "h2",
        normalized_text: "zeit akt a: 30min",
      }),
      page("legal/conversations/whatsapp/out-c", {
        channel: "whatsapp",
        direction: "outbound",
        role: "firm",
        phone_hash: "h1",
      }),
    ]);
    expect(out).toEqual([
      expect.objectContaining({
        senderHash: "h1",
        senderName: "Max",
        content: "Anbei die Vollmacht",
        caseSlug: "legal/cases/a",
      }),
    ]);
  });
});
