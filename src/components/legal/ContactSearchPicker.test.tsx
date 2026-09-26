// The client/opponent/court fields of a matter pick from a server-side search
// over every contact of the firm — not from a preloaded list of recent ones.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
const listPages = vi.fn(async (_o: { type?: string; q?: string }) => [
  {
    slug: "legal/contacts/alt-mandant",
    title: "Alt Mandant",
    frontmatter: { name: "Alt Mandant", role: "client", email: "alt@example.test" },
  },
  { slug: "legal/contacts/alt-gegner", title: "Alt Gegner", frontmatter: { role: "opponent" } },
]);
vi.mock("@/lib/api", () => ({
  api: { brain: { listPages: (o: { type?: string; q?: string }) => listPages(o) } },
}));

import { ContactSearchPicker } from "./ContactSearchPicker";

beforeEach(() => listPages.mockClear());

describe("ContactSearchPicker", () => {
  it("offers the matching contacts of its role from the server search", async () => {
    const onSelect = vi.fn();
    render(<ContactSearchPicker id="p" label="Mandant" role="client" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Mandant suchen"), { target: { value: "Alt" } });
    const option = await screen.findByRole("button", { name: /Alt Mandant/ });
    expect(listPages).toHaveBeenCalledWith(
      expect.objectContaining({ type: "legal_contact", q: "Alt" })
    );
    expect(screen.queryByRole("button", { name: /Alt Gegner/ })).toBeNull();
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "legal/contacts/alt-mandant", name: "Alt Mandant" })
    );
  });

  it("shows the current selection and can clear it", () => {
    const onSelect = vi.fn();
    render(
      <ContactSearchPicker
        id="p"
        label="Gericht"
        role="court"
        value="legal/contacts/lg"
        valueName="Landesgericht"
        onSelect={onSelect}
      />
    );
    expect(screen.getByText("Landesgericht")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gericht entfernen" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("a failed search is shown, not an empty result", async () => {
    listPages.mockRejectedValueOnce(new Error("503"));
    render(<ContactSearchPicker id="p" label="Gegner" role="opponent" onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Gegner suchen"), { target: { value: "Alt" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/nicht verfügbar/));
  });
});
