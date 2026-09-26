import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: vi.fn(),
      createPage: vi.fn(),
      deletePage: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";
import {
  applyImportPreset,
  deleteImportPreset,
  listImportPresets,
  saveImportPreset,
} from "@/lib/kanzlei-import/presets";

describe("saveImportPreset", () => {
  beforeEach(() => vi.clearAllMocks());

  test("stores the mapping as header text, not column index", async () => {
    vi.mocked(api.brain.createPage).mockResolvedValue({ slug: "import-presets/cases-x" });

    const preset = await saveImportPreset(
      "cases",
      "Kanzleisoftware X",
      ["Aktenzahl", "Rubrum", "Mandant"],
      { case_number: 0, title: 1, client_name: 2 }
    );

    expect(preset.headerMapping).toEqual({
      case_number: "Aktenzahl",
      title: "Rubrum",
      client_name: "Mandant",
    });
    expect(api.brain.createPage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "import_preset",
        frontmatter: expect.objectContaining({
          kind: "cases",
          name: "Kanzleisoftware X",
          header_mapping: {
            case_number: "Aktenzahl",
            title: "Rubrum",
            client_name: "Mandant",
          },
        }),
      })
    );
  });

  test("skips unmapped fields (index -1) — they don't pollute the stored mapping", async () => {
    vi.mocked(api.brain.createPage).mockResolvedValue({ slug: "import-presets/cases-x" });

    const preset = await saveImportPreset("cases", "Nur Titel", ["Rubrum"], {
      title: 0,
      client_name: -1,
    });

    expect(preset.headerMapping).toEqual({ title: "Rubrum" });
  });

  test("rejects a blank name", async () => {
    await expect(saveImportPreset("cases", "   ", ["Rubrum"], { title: 0 })).rejects.toThrow();
    expect(api.brain.createPage).not.toHaveBeenCalled();
  });
});

describe("listImportPresets", () => {
  beforeEach(() => vi.clearAllMocks());

  test("filters by kind and returns newest first", async () => {
    vi.mocked(api.brain.listAllPages).mockResolvedValue([
      {
        slug: "import-presets/cases-a",
        title: "Import-Vorlage: A",
        content: "",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        type: "import_preset",
        frontmatter: {
          kind: "cases",
          name: "A",
          header_mapping: { title: "Rubrum" },
          created_at: "2026-01-01T00:00:00Z",
        },
      },
      {
        slug: "import-presets/cases-b",
        title: "Import-Vorlage: B",
        content: "",
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
        type: "import_preset",
        frontmatter: {
          kind: "cases",
          name: "B",
          header_mapping: { title: "Bezeichnung" },
          created_at: "2026-02-01T00:00:00Z",
        },
      },
    ]);

    const presets = await listImportPresets("cases");
    expect(api.brain.listAllPages).toHaveBeenCalledWith(
      expect.objectContaining({ type: "import_preset", frontmatter: { kind: "cases" } })
    );
    expect(presets.map((p) => p.name)).toEqual(["B", "A"]);
  });

  test("drops pages that don't carry a valid preset shape", async () => {
    vi.mocked(api.brain.listAllPages).mockResolvedValue([
      {
        slug: "import-presets/broken",
        title: "Broken",
        content: "",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        frontmatter: { kind: "cases" }, // no name, no header_mapping
      },
    ]);

    const presets = await listImportPresets("cases");
    expect(presets).toEqual([]);
  });
});

describe("deleteImportPreset", () => {
  test("delegates to api.brain.deletePage", async () => {
    vi.mocked(api.brain.deletePage).mockResolvedValue({ success: true });
    await deleteImportPreset("import-presets/cases-a");
    expect(api.brain.deletePage).toHaveBeenCalledWith("import-presets/cases-a");
  });
});

describe("applyImportPreset", () => {
  test("resolves stored header names against the current file's headers, case-insensitively", () => {
    const mapping = applyImportPreset(
      {
        slug: "import-presets/cases-a",
        kind: "cases",
        name: "A",
        headerMapping: { title: "Rubrum", client_name: "Mandant" },
        createdAt: "",
      },
      ["MANDANT", "  Rubrum  ", "Gegner"]
    );
    expect(mapping).toEqual({ title: 1, client_name: 0 });
  });

  test("maps to -1 when the file no longer has a header the preset expects", () => {
    const mapping = applyImportPreset(
      {
        slug: "import-presets/cases-a",
        kind: "cases",
        name: "A",
        headerMapping: { title: "Rubrum", client_name: "Mandant" },
        createdAt: "",
      },
      ["Rubrum"]
    );
    expect(mapping).toEqual({ title: 0, client_name: -1 });
  });

  test("never matches by position — a reordered file still resolves by name", () => {
    const mapping = applyImportPreset(
      {
        slug: "import-presets/cases-a",
        kind: "cases",
        name: "A",
        headerMapping: { title: "Rubrum", client_name: "Mandant" },
        createdAt: "",
      },
      ["Mandant", "Rubrum"] // swapped order vs. the preset's original file
    );
    expect(mapping).toEqual({ title: 1, client_name: 0 });
  });
});
