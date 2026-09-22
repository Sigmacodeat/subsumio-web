import { describe, expect, it } from "vitest";
import { parseUnEntry, parseUnSanctionsXml } from "./un-list";
import { parseSdnEntry, parseSdnXml } from "./ofac-list";
import { isPepScreenConfigured } from "./pep";

const UN_XML = `<?xml version="1.0"?>
<CONSOLIDATED_LIST dateGenerated="2026-09-15T12:00:00Z">
<INDIVIDUALS>
<INDIVIDUAL>
<DATAID>6905683</DATAID>
<FIRST_NAME>RAMZAN</FIRST_NAME>
<SECOND_NAME>AKHMADOVITCH</SECOND_NAME>
<THIRD_NAME>KADYROV</THIRD_NAME>
<UN_LIST_TYPE>Security Council</UN_LIST_TYPE>
<REFERENCE_NUMBER>QDi.999</REFERENCE_NUMBER>
<LISTED_ON>2020-01-01</LISTED_ON>
<NAME_ALIAS><ALIAS_NAME>Ramzan Kadyrov</ALIAS_NAME></NAME_ALIAS>
<INDIVIDUAL_DATE_OF_BIRTH><DATE>1976-10-05</DATE></INDIVIDUAL_DATE_OF_BIRTH>
<INDIVIDUAL_ADDRESS><COUNTRY>Russian Federation</COUNTRY></INDIVIDUAL_ADDRESS>
<COMMENTS1>Test comment</COMMENTS1>
</INDIVIDUAL>
</INDIVIDUALS>
<ENTITIES>
<ENTITY>
<DATAID>8001</DATAID>
<FIRST_NAME>BANK ROSSIYA</FIRST_NAME>
<UN_LIST_TYPE>Security Council</UN_LIST_TYPE>
<REFERENCE_NUMBER>UNe.42</REFERENCE_NUMBER>
<ENTITY_ALIAS><ALIAS_NAME>Bank Rossiya PAO</ALIAS_NAME></ENTITY_ALIAS>
</ENTITY>
</ENTITIES>
</CONSOLIDATED_LIST>`;

const OFAC_XML = `<?xml version="1.0"?>
<sdnList>
<publshInformation><Publish_Date>09/15/2026</Publish_Date><Record_Count>2</Record_Count></publshInformation>
<sdnEntry>
<uid>36</uid>
<lastName>ROSIYA</lastName>
<firstName>BANK</firstName>
<sdnType>Entity</sdnType>
<programList><program>UKRAINE-EO13662</program></programList>
<akaList><aka><uid>12</uid><type>a.k.a.</type><category/><lastName>ROSSIYA</lastName><firstName>BANK</firstName></aka></akaList>
<addressList><address><uid>55</uid><country>Russia</country></address></addressList>
<remarks>Test remark</remarks>
</sdnEntry>
<sdnEntry>
<uid>77</uid>
<lastName>KADYROV</lastName>
<firstName>RAMZAN</firstName>
<sdnType>Individual</sdnType>
<dateOfBirthList><dateOfBirthItem><uid>9</uid><dateOfBirth>1976</dateOfBirth><mainEntry>true</mainEntry></dateOfBirthItem></dateOfBirthList>
<nationalityList><nationality><uid>1</uid><country>Russia</country></nationality></nationalityList>
</sdnEntry>
</sdnList>`;

describe("UN Consolidated List", () => {
  it("parst Personen und Entities mit Aliasen", () => {
    const list = parseUnSanctionsXml(UN_XML);
    expect(list.entries).toHaveLength(2);
    const person = list.entries[0];
    expect(person.entityType).toBe("person");
    expect(person.reference).toBe("QDi.999");
    expect(person.names).toContain("RAMZAN AKHMADOVITCH KADYROV");
    expect(person.names).toContain("Ramzan Kadyrov");
    expect(person.birthDates).toContain("1976-10-05");
    expect(person.countries).toContain("Russian Federation");
    expect(list.entries[1].entityType).toBe("enterprise");
    expect(list.generatedAt).toContain("2026-09-15");
  });

  it("Block ohne Namen → null", () => {
    expect(parseUnEntry("<INDIVIDUAL><DATAID>1</DATAID></INDIVIDUAL>", "person")).toBeNull();
  });
});

describe("OFAC SDN List", () => {
  it("parst sdnEntry mit aka, Programm und Geburtsdatum", () => {
    const list = parseSdnXml(OFAC_XML);
    expect(list.entries).toHaveLength(2);
    expect(list.generatedAt).toBe("09/15/2026");
    const entity = list.entries[0];
    expect(entity.entityType).toBe("enterprise");
    expect(entity.reference).toBe("OFAC.36");
    expect(entity.names).toContain("BANK ROSIYA");
    expect(entity.names).toContain("BANK ROSSIYA");
    expect(entity.programmes).toContain("UKRAINE-EO13662");
    const person = list.entries[1];
    expect(person.entityType).toBe("person");
    expect(person.birthDates).toContain("1976");
    expect(person.countries).toContain("Russia");
  });

  it("Block ohne Namen → null", () => {
    expect(parseSdnEntry("<sdnEntry><uid>1</uid></sdnEntry>")).toBeNull();
  });
});

describe("PEP-Adapter", () => {
  it("ohne API-Key nicht konfiguriert", () => {
    const prev = process.env.OPENSANCTIONS_API_KEY;
    delete process.env.OPENSANCTIONS_API_KEY;
    expect(isPepScreenConfigured()).toBe(false);
    if (prev) process.env.OPENSANCTIONS_API_KEY = prev;
  });
});
