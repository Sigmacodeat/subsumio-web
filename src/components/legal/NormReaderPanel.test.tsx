import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NormReaderPanel, layoutNormText } from "./NormReaderPanel";
import { openNormReader } from "@/lib/norm-reader-events";
import { linkCitationsInHtml } from "@/lib/citation-gate-client";

const RIS =
  "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10001622&Paragraf=1295";

const normMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { legal: { norm: (...args: unknown[]) => normMock(...args) } },
}));

beforeEach(() => {
  normMock.mockReset();
  normMock.mockResolvedValue({
    code: "ABGB",
    paragraph: "§ 1295",
    statute: "Allgemeines bürgerliches Gesetzbuch",
    label: "ABGB",
    jurisdiction: "at",
    text: "Von der Verbindlichkeit zum Schadenersatze:\n\n§ 1295. (1) Jedermann ist berechtigt, von dem Beschädiger den Ersatz des Schadens zu fordern.\n\n(2) Auch wer in einer gegen die guten Sitten verstoßenden Weise absichtlich Schaden zufügt, ist dafür verantwortlich.",
    source_url: RIS,
    in_force_since: "1917-01-01",
    retrieved_at: "2026-08-05",
  });
});

describe("NormReaderPanel", () => {
  it("opens with the full norm text, the RIS link and the verification badge", async () => {
    render(<NormReaderPanel />);
    act(() => openNormReader({ code: "ABGB", paragraph: "§ 1295", jurisdiction: "at" }));

    expect(await screen.findByText("Allgemeines bürgerliches Gesetzbuch")).toBeInTheDocument();
    expect(normMock).toHaveBeenCalledWith("ABGB", "§ 1295", "at");
    expect(screen.getByRole("heading", { name: "§ 1295 ABGB" })).toHaveFocus();
    expect(screen.getByText(/Jedermann ist berechtigt/)).toBeInTheDocument();
    expect(screen.getByText("Im Rechtskorpus verifiziert")).toBeInTheDocument();
    expect(screen.getByText("in Kraft seit 01.01.1917")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Amtliche Fassung im RIS/ })).toHaveAttribute(
      "href",
      RIS
    );
  });

  it("a plain click on an inline answer citation opens the reader instead of leaving the app", async () => {
    const html = linkCitationsInHtml("<p>Nach § 1295 ABGB haftet</p>", [
      { code: "ABGB", paragraph: "§ 1295", verified: true, source_url: RIS, jurisdiction: "at" },
    ]);
    render(
      <>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <NormReaderPanel />
      </>
    );
    const link = screen.getByRole("link", { name: "§ 1295 ABGB" });
    const notPrevented = fireEvent.click(link, { button: 0 });

    expect(notPrevented).toBe(false);
    await waitFor(() => expect(normMock).toHaveBeenCalledWith("ABGB", "§ 1295", "at"));
  });

  it("cmd-click keeps the link's own target (RIS in a new tab)", () => {
    const html = linkCitationsInHtml("<p>§ 1295 ABGB</p>", [
      { code: "ABGB", paragraph: "§ 1295", verified: true, source_url: RIS },
    ]);
    render(
      <>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <NormReaderPanel />
      </>
    );
    fireEvent.click(screen.getByRole("link", { name: "§ 1295 ABGB" }), {
      button: 0,
      metaKey: true,
    });
    expect(normMock).not.toHaveBeenCalled();
  });

  it("Escape closes the panel", async () => {
    render(<NormReaderPanel />);
    act(() => openNormReader({ code: "ABGB", paragraph: "§ 1295" }));
    await screen.findByText("Allgemeines bürgerliches Gesetzbuch");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("an unknown statute says so instead of showing an empty panel", async () => {
    normMock.mockRejectedValueOnce(new Error("unknown_statute"));
    render(<NormReaderPanel />);
    act(() => openNormReader({ code: "XYZG", paragraph: "§ 1" }));
    expect(
      await screen.findByText("Dieses Gesetz ist im Rechtskorpus nicht enthalten.")
    ).toBeInTheDocument();
  });
});

describe("layoutNormText", () => {
  it("separates RIS headings, the norm title and numbered Absätze", () => {
    const r = layoutNormText(
      "Klage.\n\n§. 226.\n\n(1) Die Klage hat ein bestimmtes Begehren zu enthalten.\n(2) Sie ist zu unterschreiben."
    );
    expect(r.headings).toEqual(["Klage."]);
    expect(r.normTitle).toBe("§ 226");
    expect(r.blocks).toEqual([
      { marker: "(1)", body: "Die Klage hat ein bestimmtes Begehren zu enthalten." },
      { marker: "(2)", body: "Sie ist zu unterschreiben." },
    ]);
  });

  it("text without a marker is kept as-is", () => {
    const r = layoutNormText("(1) Wer vorsätzlich …\n(2) Die gleiche Verpflichtung …");
    expect(r.normTitle).toBeNull();
    expect(r.blocks.map((b) => b.marker)).toEqual(["(1)", "(2)"]);
  });
});
