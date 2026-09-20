import { describe, expect, it } from "vitest";
import { firstNameOf, formalNameOf } from "./person-name";

describe("firstNameOf", () => {
  it("skips academic and professional titles", () => {
    expect(firstNameOf("Dr. Anna Müller")).toBe("Anna");
    expect(firstNameOf("Mag. Max Berger")).toBe("Max");
    expect(firstNameOf("Univ.-Prof. DDr. Eva Huber")).toBe("Eva");
    expect(firstNameOf("Dipl.-Ing. Dr. Karl Gruber")).toBe("Karl");
    expect(firstNameOf("RA Mag. Lisa Wolf")).toBe("Lisa");
    expect(firstNameOf("Dr. QA Techlead")).toBe("QA");
  });

  it("returns the first token for plain names", () => {
    expect(firstNameOf("Anna Müller")).toBe("Anna");
    expect(firstNameOf("  Max  ")).toBe("Max");
  });

  it("falls back sensibly on empty or title-only input", () => {
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf("Dr.")).toBe("Dr.");
  });
});

describe("formalNameOf", () => {
  it("title plus surname", () => {
    expect(formalNameOf("Dr. Anna Müller")).toBe("Dr. Anna Müller".replace("Anna ", ""));
    expect(formalNameOf("Mag. Max Berger")).toBe("Mag. Berger");
  });
  it("full name without title, email-like names untouched", () => {
    expect(formalNameOf("Karl Gruber")).toBe("Karl Gruber");
    expect(formalNameOf("")).toBe("");
  });
});
