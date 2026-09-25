// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  redactKanzleiSettingsFrontmatter,
  redactPageSecrets,
  revealSmtpPassword,
  sealKanzleiSettingsFrontmatter,
} from "@/lib/kanzlei-settings-secrets";

describe("sealKanzleiSettingsFrontmatter (OPS-18)", () => {
  it("never forwards the plaintext password; stores it encrypted", async () => {
    const fm = await sealKanzleiSettingsFrontmatter(
      { smtpHost: "smtp.example", smtpPassword: "geheim-123" },
      null
    );
    expect(fm.smtpPassword).toBeNull();
    expect(typeof fm.smtpPasswordEnc).toBe("string");
    expect(fm.smtpPasswordEnc).not.toBe("geheim-123");
    expect(await revealSmtpPassword(fm)).toBe("geheim-123");
  });

  it("keeps the stored password when the client sends none (it never receives it)", async () => {
    const stored = await sealKanzleiSettingsFrontmatter({ smtpPassword: "alt" }, null);
    const next = await sealKanzleiSettingsFrontmatter({ smtpPassword: "", iban: "AT1" }, stored);
    expect(next.smtpPasswordEnc).toBe(stored.smtpPasswordEnc);
    expect(await revealSmtpPassword(next)).toBe("alt");
  });

  it("encrypts a legacy plaintext password on the next save", async () => {
    const next = await sealKanzleiSettingsFrontmatter({ iban: "AT1" }, { smtpPassword: "legacy" });
    expect(next.smtpPassword).toBeNull();
    expect(await revealSmtpPassword(next)).toBe("legacy");
  });

  it("ignores client-supplied cipher text and flags", async () => {
    const next = await sealKanzleiSettingsFrontmatter(
      { smtpPasswordEnc: "sbenc:forged", smtpPasswordSet: true },
      null
    );
    expect(next.smtpPasswordEnc).toBeUndefined();
    expect(next.smtpPasswordSet).toBeUndefined();
  });

  it("null clears the stored password", async () => {
    const stored = await sealKanzleiSettingsFrontmatter({ smtpPassword: "alt" }, null);
    const next = await sealKanzleiSettingsFrontmatter({ smtpPassword: null }, stored);
    expect(next.smtpPasswordEnc).toBeNull();
    expect(await revealSmtpPassword(next)).toBeUndefined();
  });
});

describe("redaction on read (OPS-18)", () => {
  it("removes plaintext and cipher text, reports whether a password is set", () => {
    const out = redactKanzleiSettingsFrontmatter({
      smtpPassword: "legacy",
      smtpPasswordEnc: "sbenc:x",
      iban: "AT1",
    });
    expect(out).toEqual({ iban: "AT1", smtpPasswordSet: true });
  });

  it("redacts settings pages in single reads and lists, leaves other pages alone", () => {
    const settings = {
      slug: "legal/settings/kanzlei",
      type: "kanzlei_settings",
      frontmatter: { smtpPassword: "p", iban: "AT1" },
    };
    const other = { slug: "legal/cases/a", type: "legal_case", frontmatter: { smtpPassword: "x" } };
    expect(redactPageSecrets(settings).frontmatter).toEqual({ iban: "AT1", smtpPasswordSet: true });
    const list = redactPageSecrets([settings, other]);
    expect(list[0].frontmatter).not.toHaveProperty("smtpPassword");
    expect(list[1]).toBe(other);
  });
});
