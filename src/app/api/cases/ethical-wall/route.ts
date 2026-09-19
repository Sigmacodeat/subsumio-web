/** Replaced by /api/cases/access, which manages walls with the rest of a matter's access. */
function gone(): Response {
  return Response.json(
    { error: "moved", message: "Chinese Walls werden unter /api/cases/access verwaltet." },
    { status: 410, headers: { Location: "/api/cases/access" } }
  );
}

export const GET = gone;
export const PATCH = gone;
