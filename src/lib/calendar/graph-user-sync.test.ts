import { describe, expect, it } from "vitest";
import {
  appointmentToGraphEvent,
  graphEventToPage,
  type GraphCalendarEvent,
} from "./graph-user-sync";

describe("graphEventToPage", () => {
  const event: GraphCalendarEvent = {
    id: "AAMk123",
    subject: "Mandantengespräch Huber",
    start: { dateTime: "2026-10-05T09:00:00", timeZone: "Europe/Vienna" },
    end: { dateTime: "2026-10-05T10:00:00", timeZone: "Europe/Vienna" },
    location: { displayName: "Kanzlei" },
    webLink: "https://outlook.example/event",
    lastModifiedDateTime: "2026-10-01T12:00:00Z",
  };

  it("mappt Event auf calendar_event-Seite mit Owner", () => {
    const page = graphEventToPage(event, "anwalt@kanzlei.at");
    expect(page).not.toBeNull();
    expect(page!.slug).toBe("calendar/outlook/anwalt@kanzlei.at/AAMk123");
    expect(page!.type).toBe("calendar_event");
    const fm = page!.frontmatter;
    expect(fm.outlook_event_id).toBe("AAMk123");
    expect(fm.subject).toBe("Mandantengespräch Huber");
    expect(fm.start).toBe("2026-10-05T09:00:00");
    expect(fm.owner_email).toBe("anwalt@kanzlei.at");
    expect(fm.synced_from).toBe("outlook");
    expect(fm.location).toBe("Kanzlei");
  });

  it("Event ohne Betreff bekommt Fallback-Titel", () => {
    const page = graphEventToPage({ ...event, subject: undefined }, "a@b.at");
    expect(page!.title).toBe("Termin: (ohne Betreff)");
  });

  it("Event ohne ID → null", () => {
    expect(graphEventToPage({ ...event, id: "" }, "a@b.at")).toBeNull();
  });

  it("abgesagte Termine werden markiert statt verworfen", () => {
    const page = graphEventToPage({ ...event, isCancelled: true }, "a@b.at");
    expect(page!.frontmatter.cancelled).toBe(true);
  });
});

describe("appointmentToGraphEvent", () => {
  it("mappt Subsumio-Termin (title/duration) auf Graph-Event", () => {
    const ev = appointmentToGraphEvent({
      title: "Besprechung",
      date: "2026-10-05",
      time: "14:30",
      duration: 45,
      location: "Teams",
      description: "Agenda: Vollmacht",
    });
    expect(ev).not.toBeNull();
    expect(ev!.subject).toBe("Subsumio: Besprechung");
    expect(ev!.start).toEqual({ dateTime: "2026-10-05T14:30:00", timeZone: "Europe/Vienna" });
    expect(ev!.end.dateTime).toBe("2026-10-05T15:15:00");
    expect(ev!.location?.displayName).toBe("Teams");
    expect(ev!.body?.content).toBe("Agenda: Vollmacht");
  });

  it("WhatsApp-Termin (topic/duration_minutes) funktioniert ebenfalls", () => {
    const ev = appointmentToGraphEvent({
      topic: "Erstberatung",
      date: "2026-10-06",
      time: "10:00",
      duration_minutes: 30,
    });
    expect(ev!.subject).toBe("Subsumio: Erstberatung");
    expect(ev!.end.dateTime).toBe("2026-10-06T10:30:00");
  });

  it("fehlendes Datum → null (kein Push ohne Start)", () => {
    expect(appointmentToGraphEvent({ title: "x" })).toBeNull();
    expect(appointmentToGraphEvent({ date: "05.10.2026" })).toBeNull();
  });

  it("fehlende Uhrzeit → 09:00, fehlende Dauer → 60min", () => {
    const ev = appointmentToGraphEvent({ date: "2026-10-05" });
    expect(ev!.start.dateTime).toBe("2026-10-05T09:00:00");
    expect(ev!.end.dateTime).toBe("2026-10-05T10:00:00");
  });
});
