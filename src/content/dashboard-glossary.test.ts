// UI-9: German UI texts use the agreed German terms (Datenraum,
// Informationsbarriere, Eingabe-Token, …) instead of these anglicisms.
import { describe, expect, it } from "vitest";
import { D } from "./dashboard";

const FORBIDDEN_IN_DE = [
  "Shared Space",
  "Ethical Wall",
  "Input Tokens",
  "Output Tokens",
  "Workflow Objekte",
  "Sources —",
  "Vault konnte",
];

describe("dashboard dictionary glossary", () => {
  it("contains none of the listed anglicisms in German texts", () => {
    const hits: string[] = [];
    for (const [key, entry] of Object.entries(D)) {
      const de = (entry as { de?: string }).de ?? "";
      for (const term of FORBIDDEN_IN_DE) if (de.includes(term)) hits.push(`${key}: ${term}`);
    }
    expect(hits).toEqual([]);
  });

  it("uses the agreed terms for the corrected entries", () => {
    expect(D["cmd.action.new_space"].de).toBe("Neuer Datenraum");
    expect(D["nav.ethical_wall"].de).toBe("Informationsbarriere");
    expect(D["agents.label_input_tokens"].de).toBe("Eingabe-Token");
    expect(D["whatsapp.workflow_objects"].de).toBe("Workflow-Objekte");
  });
});
