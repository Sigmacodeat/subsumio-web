// @vitest-environment node

import { describe, test, expect } from "vitest";
import { multistatus, collectionHref, calendarDataMultistatus, xmlEscape } from "./dav-xml";

describe("dav-xml", () => {
  test("multistatus renders collection + file resources", () => {
    const xml = multistatus([
      { href: "/dokumente/", name: "Dokumente", collection: true },
      {
        href: "/dokumente/akte.pdf",
        name: "akte.pdf",
        contentType: "application/pdf",
        contentLength: 1234,
        lastModified: "Mon, 01 Jan 2026 00:00:00 GMT",
      },
    ]);
    expect(xml).toContain('<D:multistatus xmlns:D="DAV:"');
    expect(xml).toContain("<D:collection/>");
    expect(xml).toContain("<D:getcontenttype>application/pdf</D:getcontenttype>");
    expect(xml).toContain("<D:getcontentlength>1234</D:getcontentlength>");
    expect(xml).toContain("HTTP/1.1 200 OK");
  });

  test("xmlEscape prevents markup injection", () => {
    expect(xmlEscape('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });

  test("names with markup are escaped in href and displayname", () => {
    const xml = multistatus([{ href: "/dokumente/<script>", name: "<b>x</b>" }]);
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
    expect(xml).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  test("collectionHref appends trailing slash", () => {
    expect(collectionHref("/fristen")).toBe("/fristen/");
    expect(collectionHref("/fristen/")).toBe("/fristen/");
  });

  test("calendarDataMultistatus embeds ICS payload", () => {
    const xml = calendarDataMultistatus("/fristen/fristen.ics", "BEGIN:VCALENDAR\nEND:VCALENDAR");
    expect(xml).toContain("urn:ietf:params:xml:ns:caldav");
    expect(xml).toContain("<C:calendar-data>BEGIN:VCALENDAR");
    expect(xml).toContain("/fristen/fristen.ics");
  });
});
