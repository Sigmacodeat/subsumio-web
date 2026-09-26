// @vitest-environment node
/**
 * Outlook add-in: read mode only (compose fields are async objects the pane
 * cannot use), least privilege, and no invented sender address.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe("Outlook add-in manifest and mail loading", () => {
  const manifest = read("outlook-addin", "manifest.xml");
  const src = read("outlook-addin", "src", "taskpane.ts");

  it("is offered on received mails only, with read permission", () => {
    expect(manifest).toContain("<Permissions>ReadItem</Permissions>");
    expect(manifest).not.toContain('FormType="Edit"');
    expect(manifest).not.toContain('xsi:type="ItemEdit"');
    expect(manifest).not.toContain("MessageComposeCommandSurface");
    expect(manifest).toContain('FormType="Read"');
  });

  it("never invents a sender and blocks the import without one", () => {
    expect(src).not.toContain("unbekannt@absender.de");
    const importFn = src.slice(src.indexOf("async function importMail()"));
    expect(importFn.slice(0, 600)).toMatch(/if \(!currentMail\.from\)/);
  });
});
