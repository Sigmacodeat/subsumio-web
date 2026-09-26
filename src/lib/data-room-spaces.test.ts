import { describe, expect, it } from "vitest";
import { hostedRoomsToSpaces } from "./data-room-spaces";

describe("hostedRoomsToSpaces", () => {
  it("maps the hosted rooms of GET /api/data-rooms to portal cards", () => {
    const spaces = hostedRoomsToSpaces({
      data: {
        hosted: [
          {
            id: "dr_1",
            title: "Datenraum Muster gegen Beispiel",
            case_slug: "legal/cases/akte-1",
            documents: 4,
            members: 2,
            created_at: "2026-09-01",
          },
        ],
        shared_with_us: [{ id: "dr_x", title: "Fremder Raum" }],
      },
    });
    expect(spaces).toEqual([
      {
        id: "dr_1",
        slug: "legal/cases/akte-1",
        href: "/dashboard/shared-spaces/dr_1",
        name: "Datenraum Muster gegen Beispiel",
        description: "2 Beteiligte",
        status: "active",
        document_count: 4,
      },
    ]);
  });

  it("tolerates an empty or unexpected body", () => {
    expect(hostedRoomsToSpaces(null)).toEqual([]);
    expect(hostedRoomsToSpaces({ data: [] })).toEqual([]);
  });
});
