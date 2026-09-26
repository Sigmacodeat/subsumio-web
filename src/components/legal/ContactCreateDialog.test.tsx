// The duplicate/conflict check of a new contact compares against a server-side
// search over every contact of the firm, not only the contacts preloaded by
// the matter view.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listPages = vi.fn(async (_o: { type?: string; q?: string }) => [
  {
    slug: "legal/contacts/alt-mandant",
    title: "Maria Huber",
    frontmatter: { name: "Maria Huber", role: "client" },
  },
]);
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listPages: (o: { type?: string; q?: string }) => listPages(o),
      createPage: vi.fn(),
    },
  },
}));
vi.mock("@/lib/offline-store", () => ({ isOnline: () => true, enqueueMutation: vi.fn() }));

import { ContactCreateDialog, conflictSearchTerm } from "./ContactCreateDialog";

beforeEach(() => listPages.mockClear());

describe("ContactCreateDialog", () => {
  it("searches with the longest word of the name", () => {
    expect(conflictSearchTerm("Maria Huber")).toBe("Maria");
    expect(conflictSearchTerm("Dr. Maximilian Huber")).toBe("Maximilian");
    expect(conflictSearchTerm("Al")).toBe("Al");
  });

  it("flags a role conflict with a contact only the server search finds", async () => {
    const onCreated = vi.fn();
    render(
      <ContactCreateDialog
        open
        onOpenChange={vi.fn()}
        defaultRole="opponent"
        existingContacts={[]}
        onCreated={onCreated}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Vor- und Nachname"), {
      target: { value: "Maria Huber" },
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Maria Huber/));
    expect(listPages).toHaveBeenCalledWith(
      expect.objectContaining({ type: "legal_contact", q: "Maria" })
    );
    // The found contact can be used instead of creating a duplicate.
    fireEvent.click(screen.getByRole("button", { name: /Verwenden/ }));
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "legal/contacts/alt-mandant" })
    );
  });

  it("says when the search is unavailable", async () => {
    listPages.mockRejectedValue(new Error("503"));
    render(
      <ContactCreateDialog
        open
        onOpenChange={vi.fn()}
        defaultRole="client"
        defaultName="Maria Huber"
        existingContacts={[]}
        onCreated={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/Kontaktsuche ist derzeit nicht/)
    );
    listPages.mockReset();
  });
});
