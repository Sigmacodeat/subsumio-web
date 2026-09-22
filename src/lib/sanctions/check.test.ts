import { describe, expect, it } from "vitest";
import { applyCheckResult, describeSource, namesToCheck, runSanctionsCheck } from "./check";
import type { StoredList } from "./store";
import type { KYCVerification } from "@/lib/kyc";

const list: StoredList = {
  source: "eu-fsf",
  generatedAt: "2026-08-05T16:47:04.449+02:00",
  entryCount: 2,
  refreshedAt: "2026-09-18T04:20:00.000Z",
  entries: [
    {
      reference: "EU.27.28",
      entityType: "person",
      primaryName: "Ramzan Akhmadovitch Kadyrov",
      names: ["Ramzan Kadyrov", "Ramzan Akhmadovitch Kadyrov"],
      birthDates: ["1976-10-05"],
      countries: ["RU"],
      programmes: ["UKR"],
    },
    {
      reference: "EU.99.1",
      entityType: "enterprise",
      primaryName: "Bank Rossiya",
      names: ["Bank Rossiya"],
      birthDates: [],
      countries: ["RU"],
      programmes: ["UKR"],
    },
  ],
};

const record = (over: Partial<KYCVerification> = {}) =>
  ({
    client_name: "Mag. Anna Berger",
    beneficial_owners: [],
    ...over,
  }) as KYCVerification;

describe("Sanktionsprüfung einer Akte", () => {
  it("prüft Mandant und wirtschaftliche Eigentümer, ohne Namen doppelt zu prüfen", () => {
    const names = namesToCheck(
      record({
        client_name: "Muster GmbH",
        beneficial_owners: [
          { name: "Ramzan Kadyrov", verified: true },
          { name: "Muster GmbH", verified: true },
          { name: " ", verified: false },
        ],
      })
    );
    expect(names).toEqual(["Muster GmbH", "Ramzan Kadyrov"]);
  });

  it("meldet keinen Treffer und nennt Liste, Stand und Umfang", async () => {
    const result = await runSanctionsCheck(
      record(),
      { now: new Date("2026-09-18T08:00:00Z") },
      async () => [list]
    );
    expect(result).toMatchObject({
      hits: [],
      checkedNames: ["Mag. Anna Berger"],
      listGeneratedAt: "2026-08-05T16:47:04.449+02:00",
    });
    expect(describeSource(list)).toBe(
      "EU-Finanzsanktionsliste (FSF), Stand 2026-08-05, 2 Listungen"
    );
    const fields = applyCheckResult(result!);
    expect(fields).toMatchObject({ sanctions_checked: true, sanctions_hit: false });
    expect(fields.sanctions_source).toBe(
      "EU-Finanzsanktionsliste (FSF), Stand 2026-08-05, 2 Listungen, geprüft 2026-09-18"
    );
  });

  it("findet einen gelisteten wirtschaftlichen Eigentümer und markiert den Treffer", async () => {
    const result = await runSanctionsCheck(
      record({
        client_name: "Muster GmbH",
        beneficial_owners: [{ name: "Ramzan Kadyrov", verified: true }],
      }),
      {},
      async () => [list]
    );
    expect(result!.hits).toHaveLength(1);
    expect(result!.hits[0].name).toBe("Ramzan Kadyrov");
    expect(result!.hits[0].matches[0]).toMatchObject({
      reference: "EU.27.28",
      programmes: ["UKR"],
    });
    expect(applyCheckResult(result!).sanctions_hit).toBe(true);
  });

  it("nutzt das Geburtsdatum nur für den Mandanten", async () => {
    const same = await runSanctionsCheck(
      record({ client_name: "Ramzan Kadyrov" }),
      { birthDate: "1976-10-05" },
      async () => [list]
    );
    expect(same!.hits[0].matches[0].kind).toBe("exact");
    const other = await runSanctionsCheck(
      record({ client_name: "Ramzan Kadyrov" }),
      { birthDate: "1990-01-01" },
      async () => [list]
    );
    expect(other!.hits[0].matches[0].kind).not.toBe("exact");
  });

  it("gibt null zurück, solange keine Liste geladen ist — kein falsches „keine Treffer“", async () => {
    expect(await runSanctionsCheck(record(), {}, async () => [])).toBeNull();
  });
});
