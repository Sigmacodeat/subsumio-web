// @vitest-environment node
// The SCIM page promises only what the sync does: name and e-mail are
// applied (e-mail only when free), groups are stored per firm and grant a
// role only through the firm's mapping, never admin (src/lib/scim.ts,
// scim-groups.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

describe("SCIM settings copy", () => {
  it("describes exactly the implemented scope", () => {
    expect(page).not.toMatch(/Änderungen an Name, E-Mail-Adresse oder Rolle werden übernommen/);
    expect(page).not.toMatch(/nicht dauerhaft gespeichert/);
    expect(page).toMatch(/Änderungen an Name und E-Mail-Adresse werden übernommen/);
    expect(page).toMatch(/nur übernommen, wenn sie in Subsumio noch frei ist/);
    expect(page).toMatch(/pro Kanzlei gespeichert/);
    expect(page).toMatch(/nie die Admin-Rolle/);
    expect(page).toMatch(/<ScimGroupRoles \/>/);
  });
});
