import { describe, expect, test } from "bun:test";
import { coverage, risBodyText, words } from "../scripts/verify-text-against-ris-xml.ts";

const XML = `<?xml version="1.0"?><risdok><nutzdaten><abschnitt>
<kzinhalt typ="p"><absatz typ="kz">Landesrecht Burgenland</absatz></kzinhalt>
<fzinhalt typ="p"><absatz typ="fz">www.ris.bka.gv.at Seite 1 von 1</absatz></fzinhalt>
<ueberschrift typ="titel">Kurztitel</ueberschrift><absatz typ="erltext" ct="kurztitel">Testgesetz</absatz>
<ueberschrift typ="titel">Text</ueberschrift>
<absatz typ="abs" ct="text">Dieses Landesgesetz tritt in Kraft:</absatz>
<absatz typ="abs" ct="text">1. Art. I Z 1 bis 3 mit 1. September 1997;</absatz>
<absatz typ="abs" ct="text">2. Art. I Z 4 bis 8 mit 1. September 1998.</absatz>
<ueberschrift typ="titel">Zuletzt aktualisiert am</ueberschrift><absatz typ="erltext">20.09.2026</absatz>
</abschnitt></nutzdaten></risdok>`;

describe("risBodyText", () => {
  test("takes what stands between the Text heading and the next metadata block", () => {
    const body = risBodyText(XML)!;
    expect(body).toContain("tritt in Kraft");
    expect(body).toContain("1. September 1998");
    expect(body).not.toContain("Testgesetz"); // metadata before
    expect(body).not.toContain("20.09.2026"); // metadata after
  });

  test("page headers and footers are layout, not law", () => {
    expect(risBodyText(XML)).not.toContain("www.ris.bka.gv.at");
  });

  test("a document without a Text section yields null", () => {
    expect(risBodyText("<risdok><nutzdaten/></risdok>")).toBeNull();
  });
});

describe("coverage", () => {
  const expected = words(risBodyText(XML)!);

  test("a faithful page covers the original completely", () => {
    const page = "# Testgesetz\n\nDieses Landesgesetz tritt in Kraft:\n\n1. Art. I Z 1 bis 3 mit 1. September 1997;\n\n2. Art. I Z 4 bis 8 mit 1. September 1998.";
    expect(coverage(expected, words(page))).toBe(1);
  });

  test("a page that lost its numbered list is caught — the defect found on 2026-09-21", () => {
    const truncated = "# Testgesetz\n\nDieses Landesgesetz tritt in Kraft:";
    expect(coverage(expected, words(truncated))).toBeLessThan(0.5);
  });

  test("counts as a multiset: a word present once does not cover it twice", () => {
    expect(coverage(["september", "september"], ["september"])).toBe(0.5);
  });

  test("an empty original is trivially covered", () => {
    expect(coverage([], ["irgendwas"])).toBe(1);
  });
});
