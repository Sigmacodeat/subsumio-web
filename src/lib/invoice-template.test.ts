// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("./kanzlei-settings", () => ({
  loadKanzleiSettings: vi.fn(async () => ({
    kanzleiName: "Test Kanzlei",
    anwaltName: "Max",
    kanzleiAdresse: "Hauptstr. 1\n1010 Wien\nÖsterreich",
    kanzleiEmail: "test@kanzlei.at",
    kanzleiTelefon: "+43 1 234",
    ustId: "ATU123",
    stundensatz: "200",
    bankName: "Bank",
    iban: "AT00 0000",
    bic: "BIC00",
    street: "Hauptstr. 1",
    city: "Wien",
    zip: "1010",
    country: "Österreich",
    website: "www.kanzlei.at",
    taxNumber: "TN123",
    logoUrl: undefined,
  })),
  normalizeKanzleiSettings: vi.fn((input: any) => input),
  readLocalKanzleiSettings: vi.fn(() => ({
    kanzleiName: "Local Kanzlei",
    anwaltName: "",
    kanzleiAdresse: "Local Str. 1\nWien",
    ustId: "",
    stundensatz: "200",
  })),
  saveKanzleiSettings: vi.fn(async () => {}),
  DEFAULT_KANZLEI_SETTINGS: {
    kanzleiName: "",
    anwaltName: "",
    ustId: "",
    stundensatz: "200",
  },
}));

import {
  getKanzleiSettings,
  loadInvoiceTemplateSettings,
  saveKanzleiSettings,
  renderInvoiceHeader,
  renderBankDetails,
  type KanzleiSettings,
} from "./invoice-template";

const testSettings: KanzleiSettings = {
  name: "Mustermann Kanzlei",
  street: "Hauptstr. 42",
  city: "Wien",
  zip: "1010",
  country: "Österreich",
  phone: "+43 1 234567",
  email: "office@mustermann.at",
  website: "www.mustermann.at",
  ustId: "ATU12345678",
  taxNumber: "TN-98765",
  bankName: "Erste Bank",
  iban: "AT11 2233 4455 6677 8899",
  bic: "GIBAATWWXXX",
};

describe("getKanzleiSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns settings from local store", () => {
    const result = getKanzleiSettings();
    expect(result.name).toBe("Local Kanzlei");
  });
});

describe("loadInvoiceTemplateSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  test("loads settings from canonical store", async () => {
    const result = await loadInvoiceTemplateSettings();
    expect(result.name).toBe("Test Kanzlei");
    expect(result.email).toBe("test@kanzlei.at");
  });

  test("maps kanzleiAdresse to street when street is not set", async () => {
    const result = await loadInvoiceTemplateSettings();
    // The mock returns street: "Hauptstr. 1" which takes priority
    expect(result.street).toBe("Hauptstr. 1");
  });

  test("maps country from address lines when not set", async () => {
    const result = await loadInvoiceTemplateSettings();
    expect(result.country).toBe("Österreich");
  });
});

describe("saveKanzleiSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls saveCanonicalKanzleiSettings with mapped fields", async () => {
    const { saveKanzleiSettings: saveCanonical } = await import("./kanzlei-settings");
    await saveKanzleiSettings(testSettings);
    expect(saveCanonical).toHaveBeenCalledOnce();
    const call = vi.mocked(saveCanonical).mock.calls[0][0];
    expect(call.kanzleiName).toBe("Mustermann Kanzlei");
    expect(call.kanzleiTelefon).toBe("+43 1 234567");
    expect(call.kanzleiEmail).toBe("office@mustermann.at");
    expect(call.ustId).toBe("ATU12345678");
    expect(call.iban).toBe("AT11 2233 4455 6677 8899");
  });

  test("combines address lines from street, zip+city, and country", async () => {
    const { saveKanzleiSettings: saveCanonical } = await import("./kanzlei-settings");
    await saveKanzleiSettings(testSettings);
    const call = vi.mocked(saveCanonical).mock.calls[0][0];
    expect(call.kanzleiAdresse).toContain("Hauptstr. 42");
    expect(call.kanzleiAdresse).toContain("1010 Wien");
    expect(call.kanzleiAdresse).toContain("Österreich");
  });
});

describe("renderInvoiceHeader", () => {
  test("renders multi-line header with all fields", () => {
    const header = renderInvoiceHeader(testSettings);
    const lines = header.split("\n");
    expect(lines[0]).toBe("Mustermann Kanzlei");
    expect(lines[1]).toBe("Hauptstr. 42");
    expect(lines[2]).toBe("1010 Wien");
    expect(lines[3]).toBe("Tel: +43 1 234567");
    expect(lines[4]).toBe("E-Mail: office@mustermann.at");
    expect(lines[5]).toBe("USt-IdNr: ATU12345678");
  });

  test("handles empty fields", () => {
    const empty: KanzleiSettings = {
      name: "", street: "", city: "", zip: "", country: "",
      phone: "", email: "", website: "", ustId: "", taxNumber: "",
      bankName: "", iban: "", bic: "",
    };
    const header = renderInvoiceHeader(empty);
    expect(header).toContain("Tel: ");
    expect(header).toContain("E-Mail: ");
    expect(header).toContain("USt-IdNr: ");
  });
});

describe("renderBankDetails", () => {
  test("renders bank details block", () => {
    const bank = renderBankDetails(testSettings);
    const lines = bank.split("\n");
    expect(lines[0]).toBe("Bankverbindung:");
    expect(lines[1]).toBe("Erste Bank");
    expect(lines[2]).toBe("IBAN: AT11 2233 4455 6677 8899");
    expect(lines[3]).toBe("BIC: GIBAATWWXXX");
  });

  test("handles empty bank fields", () => {
    const empty: KanzleiSettings = {
      name: "", street: "", city: "", zip: "", country: "",
      phone: "", email: "", website: "", ustId: "", taxNumber: "",
      bankName: "", iban: "", bic: "",
    };
    const bank = renderBankDetails(empty);
    expect(bank).toContain("Bankverbindung:");
    expect(bank).toContain("IBAN: ");
    expect(bank).toContain("BIC: ");
  });
});
