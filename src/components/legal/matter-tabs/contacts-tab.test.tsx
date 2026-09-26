// R11-6: the matter's own contacts are shown even when they are not among
// the firm-wide list the matter view preloads (most recently edited only).
import { render, screen } from "@testing-library/react";
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
vi.mock("@/lib/api", () => ({ api: { brain: { getPages: (s: string[]) => getPages(s) } } }));

// 300 unrelated, recently edited contacts preloaded by the matter view.
const preloaded = Array.from({ length: 300 }, (_, i) => ({
  slug: `legal/contacts/other-${i}`,
  name: `Andere ${i}`,
  role: "other",
}));
let hook: () => Record<string, unknown>;
vi.mock("@/lib/matter-detail-context", () => ({ useMatterDetail: () => hook() }));

import { ContactsTab } from "./contacts-tab";

describe("ContactsTab", () => {
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
