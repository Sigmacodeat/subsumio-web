// @vitest-environment node
// The SCIM page promises only what the sync does: names are applied, e-mail
// and role are not, and groups grant no rights (src/lib/scim.ts, scim-groups.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

describe("SCIM settings copy", () => {
  it("does not promise e-mail/role sync or group rights", () => {
    expect(page).not.toMatch(/Änderungen an Name, E-Mail-Adresse oder Rolle werden übernommen/);
    expect(page).not.toMatch(/werden als Gruppen in Subsumio übernommen/);
    expect(page).toMatch(/E-Mail-Adresse und Rolle werden nicht aus dem Verzeichnis übernommen/);
    expect(page).toMatch(/vergeben in Subsumio aber keine Rechte/);
  });
});
