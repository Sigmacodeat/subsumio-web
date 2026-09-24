/**
 * The client-portal preview lists the data rooms the firm hosts for its
 * matters. `GET /api/data-rooms` answers `{ data: { hosted, shared_with_us } }`;
 * this maps the hosted rooms to the preview's card shape.
 */
export interface HostedDataRoom {
  id: string;
  title: string;
  case_slug: string;
  documents: number;
  members: number;
  created_at?: string;
}

export interface SharedSpaceCard {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  document_count: number;
  expires_at?: string;
}

export function hostedRoomsToSpaces(body: unknown): SharedSpaceCard[] {
  const data = (body as { data?: { hosted?: unknown } } | null)?.data;
  const hosted = Array.isArray(data?.hosted) ? (data.hosted as HostedDataRoom[]) : [];
  return hosted.map((room) => ({
    id: room.id,
    slug: room.case_slug,
    name: room.title,
    description:
      room.members > 0
        ? `${room.members} ${room.members === 1 ? "Beteiligter" : "Beteiligte"}`
        : undefined,
    // Hosted rooms are listed only while they exist; revoked members are
    // already filtered out server-side.
    status: "active",
    document_count: room.documents ?? 0,
  }));
}
