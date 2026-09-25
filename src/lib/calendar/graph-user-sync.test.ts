import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appointmentPushAction,
  appointmentToGraphEvent,
  fetchCalendarView,
  graphEventToPage,
  pullOutlookEvents,
  pushAppointmentsToOutlook,
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

  it("Ende rollt über Mitternacht in den Folgetag", () => {
    const ev = appointmentToGraphEvent({ date: "2026-10-05", time: "23:30", duration: 90 });
    expect(ev!.start.dateTime).toBe("2026-10-05T23:30:00");
    expect(ev!.end.dateTime).toBe("2026-10-06T01:00:00");
  });
});

describe("appointmentPushAction", () => {
  const base = { sync_to_outlook: true, date: "2026-10-05", time: "10:00" };
  it("neu → create, geändert → update, unverändert → nichts", () => {
    expect(appointmentPushAction(base)).toBe("create");
    expect(
      appointmentPushAction({
        ...base,
        outlook_event_id: "E1",
        updated_at: "2026-10-01T10:00:00Z",
        outlook_synced_at: "2026-10-01T09:00:00Z",
      })
    ).toBe("update");
    expect(
      appointmentPushAction({
        ...base,
        outlook_event_id: "E1",
        updated_at: "2026-10-01T08:00:00Z",
        outlook_synced_at: "2026-10-01T09:00:00Z",
      })
    ).toBeNull();
  });

  it("abgesagt/gelöscht mit Outlook-Kopie → delete (einmal)", () => {
    expect(appointmentPushAction({ ...base, outlook_event_id: "E1", status: "cancelled" })).toBe(
      "delete"
    );
    expect(appointmentPushAction({ ...base, outlook_event_id: "E1", status: "tombstoned" })).toBe(
      "delete"
    );
    expect(
      appointmentPushAction({
        ...base,
        outlook_event_id: "E1",
        status: "cancelled",
        outlook_deleted_at: "2026-10-02T00:00:00Z",
      })
    ).toBeNull();
    expect(appointmentPushAction({ ...base, status: "cancelled" })).toBeNull();
  });
});

describe("Graph-Sync gegen gemocktes Graph/Engine", () => {
  const calls: Array<{ url: string; method: string; body?: unknown; headers?: HeadersInit }> = [];
  let graphHandler: (url: string, method: string) => Response;

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({
          url,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          headers: init?.headers,
        });
        if (url.startsWith("https://graph.microsoft.com")) return graphHandler(url, method);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const appt = (fm: Record<string, unknown>) => ({
    slug: "legal/appointments/appt-1",
    title: "Verhandlung",
    frontmatter: {
      type: "appointment",
      title: "Verhandlung",
      date: "2026-10-05",
      time: "10:00",
      duration: 60,
      sync_to_outlook: true,
      calendar_owner_email: "anwalt@kanzlei.at",
      ...fm,
    },
  });
  const engineWrites = () => calls.filter((c) => !c.url.startsWith("https://graph"));

  it("geänderter Termin → PATCH /me/events/{id}, Sync-Zeit wird gesetzt", async () => {
    graphHandler = () => new Response(JSON.stringify({ id: "E1" }), { status: 200 });
    const out = await pushAppointmentsToOutlook(
      "tok",
      {},
      [
        appt({
          outlook_event_id: "E1",
          updated_at: "2026-10-02T10:00:00Z",
          outlook_synced_at: "2026-10-01T10:00:00Z",
        }),
      ],
      ["Anwalt@Kanzlei.at"]
    );
    expect(out).toMatchObject({ updated: 1, pushed: 0, deleted: 0, errors: [] });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toBe("https://graph.microsoft.com/v1.0/me/events/E1");
    expect(
      (engineWrites()[0].body as { frontmatter: Record<string, unknown> }).frontmatter
    ).toHaveProperty("outlook_synced_at");
  });

  it("gelöschter Termin → DELETE /me/events/{id}, Löschung wird vermerkt", async () => {
    graphHandler = () => new Response(null, { status: 204 });
    const out = await pushAppointmentsToOutlook(
      "tok",
      {},
      [appt({ outlook_event_id: "E1", status: "tombstoned" })],
      ["anwalt@kanzlei.at"]
    );
    expect(out.deleted).toBe(1);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/me/events/E1"))).toBe(true);
    expect(
      (engineWrites()[0].body as { frontmatter: Record<string, unknown> }).frontmatter
    ).toHaveProperty("outlook_deleted_at");
  });

  it("Termine anderer Personen werden nicht gepusht", async () => {
    graphHandler = () => new Response(JSON.stringify({ id: "E9" }), { status: 201 });
    const out = await pushAppointmentsToOutlook(
      "tok",
      {},
      [appt({ calendar_owner_email: "kollegin@kanzlei.at" })],
      ["anwalt@kanzlei.at"]
    );
    expect(out.pushed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("150 Termine über @odata.nextLink → alle gezogen, in Wiener Zeit angefragt", async () => {
    const ev = (i: number) => ({
      id: `E${i}`,
      subject: `T${i}`,
      start: { dateTime: "2026-10-05T09:00:00.0000000", timeZone: "Europe/Vienna" },
      end: { dateTime: "2026-10-05T10:00:00.0000000", timeZone: "Europe/Vienna" },
    });
    graphHandler = (url) => {
      if (url.includes("skiptoken=2")) {
        return new Response(
          JSON.stringify({ value: Array.from({ length: 50 }, (_, i) => ev(100 + i)) })
        );
      }
      return new Response(
        JSON.stringify({
          value: Array.from({ length: 100 }, (_, i) => ev(i)),
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=2",
        })
      );
    };
    const window = {
      start: new Date("2026-10-01T00:00:00Z"),
      end: new Date("2026-11-01T00:00:00Z"),
    };
    const events = await fetchCalendarView("tok", window);
    expect(events).toHaveLength(150);
    expect((calls[0].headers as Record<string, string>).Prefer).toBe(
      'outlook.timezone="Europe/Vienna"'
    );

    calls.length = 0;
    const pull = await pullOutlookEvents(
      "tok",
      {},
      { email: "anwalt@kanzlei.at", userId: "u1" },
      window,
      new Set(["E0"])
    );
    // E0 mirrors a Subsumio appointment → not imported a second time.
    expect(pull.pulled).toBe(149);
    expect(engineWrites()).toHaveLength(149);
    const fm = (engineWrites()[0].body as { frontmatter: Record<string, unknown> }).frontmatter;
    expect(fm.timezone).toBe("Europe/Vienna");
    expect(fm.owner_user_id).toBe("u1");
  });
});
