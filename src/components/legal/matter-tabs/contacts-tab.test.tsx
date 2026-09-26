// R11-6: the matter's own contacts are shown even when they are not among
// the firm-wide list the matter view preloads (most recently edited only).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/legal/ContactCreateDialog", () => ({ ContactCreateDialog: () => null }));
vi.mock("@/components/legal/WhatsAppClientInvitePanel", () => ({
  WhatsAppClientInvitePanel: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
const getPages = vi.fn(async (slugs: string[]) =>
  Object.fromEntries(
    slugs.map((slug) => [
      slug,
      {
        slug,
        title: slug,
        frontmatter: { name: "Maria Mandantin", role: "client", phone: "+43 1 234" },
      },
    ])
  )
);
const listPages = vi.fn(async (opts: { q?: string }) =>
  opts.q
    ? [
        {
          slug: "legal/contacts/alt-gegner",
          title: "Otto Altgegner",
          frontmatter: { name: "Otto Altgegner", role: "opponent", email: "otto@example.test" },
        },
      ]
    : []
);
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      getPages: (s: string[]) => getPages(s),
      listPages: (o: { q?: string }) => listPages(o),
    },
  },
}));

// 300 unrelated, recently edited contacts preloaded by the matter view.
const preloaded = Array.from({ length: 300 }, (_, i) => ({
  slug: `legal/contacts/other-${i}`,
  name: `Andere ${i}`,
  role: "other",
}));
let hook: () => Record<string, unknown>;
vi.mock("@/lib/matter-detail-context", () => ({ useMatterDetail: () => hook() }));

import { ContactsTab } from "./contacts-tab";

function matterHook() {
  hook = () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [contacts, setContactsList] = useState(preloaded);
    return {
      caseData: { slug: "legal/cases/alt", clientSlug: "legal/contacts/mandantin", status: "open" },
      contacts,
      setContactsList,
      contactsLoading: false,
      contactConflict: null,
      setContactDialogRole: vi.fn(),
      setContactDialogName: vi.fn(),
      setContactDialogOpen: vi.fn(),
      setPendingSuggestedPartyIndex: vi.fn(),
      contactDialogOpen: false,
    };
  };
}

describe("ContactsTab", () => {
  it("'Alle Kontakte' searches every firm contact on the server, not the preloaded recent ones", async () => {
    matterHook();
    render(<ContactsTab />);
    // The preloaded recently edited contacts are not passed off as "all contacts".
    expect(screen.queryByText("Andere 0")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Nach Name oder E-Mail suchen/), {
      target: { value: "otto" },
    });
    expect(await screen.findByText("Otto Altgegner")).toBeInTheDocument();
    expect(listPages).toHaveBeenCalledWith({ type: "legal_contact", q: "otto", limit: 50 });
  });

  it("a single character does not search", async () => {
    listPages.mockClear();
    matterHook();
    render(<ContactsTab />);
    fireEvent.change(screen.getByPlaceholderText(/Nach Name oder E-Mail suchen/), {
      target: { value: "o" },
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(listPages).not.toHaveBeenCalled();
  });

  it("a failed search says so", async () => {
    listPages.mockRejectedValueOnce(new Error("503"));
    matterHook();
    render(<ContactsTab />);
    fireEvent.change(screen.getByPlaceholderText(/Nach Name oder E-Mail suchen/), {
      target: { value: "mayer" },
    });
    await waitFor(() =>
      expect(screen.getByText("Die Suche ist derzeit nicht verfügbar.")).toBeInTheDocument()
    );
  });

  it("loads the client of an older matter by slug and shows it as linked", async () => {
    hook = () => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [contacts, setContactsList] = useState(preloaded);
      return {
        caseData: { slug: "legal/cases/alt", clientSlug: "legal/contacts/mandantin", status: "open" },
        contacts,
        setContactsList,
        contactsLoading: false,
        contactConflict: null,
        setContactDialogRole: vi.fn(),
        setContactDialogName: vi.fn(),
        setContactDialogOpen: vi.fn(),
        setPendingSuggestedPartyIndex: vi.fn(),
        contactDialogOpen: false,
      };
    };
    render(<ContactsTab />);
    expect(await screen.findByText("Maria Mandantin")).toBeInTheDocument();
    expect(getPages).toHaveBeenCalledWith(["legal/contacts/mandantin"]);
    expect(screen.getByText("contactstab.linked_to_case")).toBeInTheDocument();
  });
});
