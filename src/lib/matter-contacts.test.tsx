// The matter view loads only the matter's own contacts (by slug) and finds
// every other contact with a server-side search — no silently capped list of
// recently edited contacts. Client messages go to the matter's client only.
import { act, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseDetail } from "@/lib/matter-detail-types";

const getPages = vi.fn(async (slugs: string[]) =>
  Object.fromEntries(
    slugs
      .filter((s) => !s.includes("deleted"))
      .map((slug) => [
        slug,
        { slug, title: slug, frontmatter: { name: `N ${slug}`, role: "client", phone: "+43" } },
      ])
  )
);
const listPages = vi.fn(async (_o: { type?: string; q?: string; limit?: number }) => [
  { slug: "c/1", title: "Otto", frontmatter: { name: "Otto", role: "opponent" } },
]);
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      getPages: (s: string[]) => getPages(s),
      listPages: (o: { type?: string; q?: string; limit?: number }) => listPages(o),
    },
  },
}));

import {
  CONTACT_SEARCH_LIMIT,
  linkedContactSlugs,
  loadLinkedContacts,
  matterClientContact,
  useContactSearch,
} from "./matter-contacts";

const matter = {
  slug: "legal/cases/alt",
  clientSlug: "legal/contacts/mandantin",
  opponentSlugs: ["legal/contacts/gegner", "legal/contacts/mandantin"],
  courtSlug: "legal/contacts/gericht",
  ownLawyerSlug: "legal/contacts/deleted-lawyer",
} as unknown as CaseDetail;

beforeEach(() => {
  getPages.mockClear();
  listPages.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("matter contacts", () => {
  it("loads exactly the linked contacts by slug", async () => {
    expect(linkedContactSlugs(matter)).toEqual([
      "legal/contacts/mandantin",
      "legal/contacts/gegner",
      "legal/contacts/gericht",
      "legal/contacts/deleted-lawyer",
    ]);
    const contacts = await loadLinkedContacts(matter);
    expect(getPages).toHaveBeenCalledWith(linkedContactSlugs(matter));
    expect(contacts.map((c) => c.slug)).toEqual([
      "legal/contacts/mandantin",
      "legal/contacts/gegner",
      "legal/contacts/gericht",
    ]);
    expect(listPages).not.toHaveBeenCalled();
  });

  it("a matter without linked contacts reads nothing", async () => {
    expect(await loadLinkedContacts({ slug: "x" } as unknown as CaseDetail)).toEqual([]);
    expect(getPages).not.toHaveBeenCalled();
  });

  it("the client recipient is the matter's client, not any contact with the client role", () => {
    const contacts = [
      { slug: "legal/contacts/other-client", name: "Fremd", role: "client", phone: "+1" },
      { slug: "legal/contacts/mandantin", name: "Mandantin", role: "client", phone: "+43" },
    ];
    expect(matterClientContact(matter, contacts)?.slug).toBe("legal/contacts/mandantin");
    expect(matterClientContact({ clientSlug: undefined }, contacts)).toBeUndefined();
    expect(matterClientContact(matter, [contacts[0]!])).toBeUndefined();
  });

  it("the matter view does not preload a firm-wide contact list", () => {
    const src = readFileSync(join(__dirname, "matter-detail-context.tsx"), "utf8");
    expect(src).not.toMatch(/legal_contact/);
    expect(src).toMatch(/loadLinkedContacts\(detail\)/);
  });
});

describe("useContactSearch", () => {
  it("searches the server after a short pause, from two characters on", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ term }) => useContactSearch(term), {
      initialProps: { term: "O" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(listPages).not.toHaveBeenCalled();
    expect(result.current.results).toBeNull();
    rerender({ term: "Ot" });
    rerender({ term: "Otto " });
    expect(result.current.state).toBe("loading");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(listPages).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledWith({
      type: "legal_contact",
      q: "Otto",
      limit: CONTACT_SEARCH_LIMIT,
    });
    expect(result.current.results?.map((c) => c.name)).toEqual(["Otto"]);
    expect(result.current.limited).toBe(false);
  });

  it("reports a failed search instead of 'no contacts'", async () => {
    listPages.mockRejectedValueOnce(new Error("503"));
    const { result } = renderHook(() => useContactSearch("Otto"));
    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(result.current.results).toBeNull();
  });

  it("says when more contacts match than were returned", async () => {
    listPages.mockResolvedValueOnce(
      Array.from({ length: CONTACT_SEARCH_LIMIT }, (_, i) => ({
        slug: `c/${i}`,
        title: `C ${i}`,
        frontmatter: { name: `C ${i}`, role: "client" },
      }))
    );
    const { result } = renderHook(() => useContactSearch("Co"));
    await waitFor(() => expect(result.current.limited).toBe(true));
  });
});
