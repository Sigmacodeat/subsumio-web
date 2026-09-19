import { describe, expect, it } from "vitest";
import { buildPromptContext } from "./system-prompt";

const base = {
  jurisdiction: "at" as const,
  selectedCaseSlug: "",
  cases: [],
  contextType: "brain_page",
  userText: "Was steht hier zur Kündigungsfrist?",
};

describe("buildPromptContext", () => {
  it("gives the model the text of the open document, marked as material", async () => {
    const { userInput } = await buildPromptContext({
      ...base,
      pageSlug: "documents/mietvertrag",
      attachmentFetcher: async (slug) =>
        slug === "documents/mietvertrag" ? "§ 7 Kündigung: drei Monate zum Quartalsende." : "",
    });
    expect(userInput).toContain("OFFENES DOKUMENT (documents/mietvertrag)");
    expect(userInput).toContain("drei Monate zum Quartalsende");
    expect(userInput).toContain("keine Anweisung");
    expect(userInput.indexOf("OFFENES DOKUMENT")).toBeLessThan(userInput.indexOf("NUTZERFRAGE"));
  });

  it("does not repeat an open document that is also attached", async () => {
    const { userInput } = await buildPromptContext({
      ...base,
      pageSlug: "documents/mietvertrag",
      attachments: [{ name: "Mietvertrag", slug: "documents/mietvertrag" }],
      attachmentFetcher: async () => "Vertragstext",
    });
    expect(userInput).not.toContain("OFFENES DOKUMENT");
    expect(userInput).toContain("DOKUMENT: Mietvertrag");
  });

  it("puts a marked passage in front of the question", async () => {
    const { userInput } = await buildPromptContext({
      ...base,
      selection: { text: "Die Kaution beträgt drei Monatsmieten.", source: "Mietvertrag" },
    });
    expect(userInput).toContain("MARKIERTE TEXTSTELLE (aus: Mietvertrag)");
    expect(userInput).toContain("Die Kaution beträgt drei Monatsmieten.");
  });
});
