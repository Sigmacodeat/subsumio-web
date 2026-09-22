import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  searchCourts,
  findCourtBySafeId,
  determineJurisdiction,
  GERMAN_COURTS,
  AUSTRIAN_COURTS,
  type CourtEntry,
} from "@/lib/court-directory";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  city: z.string().max(200).optional(),
  state: z.string().max(50).optional(),
  type: z
    .enum([
      "lg",
      "ag",
      "olg",
      "bg",
      "sg",
      "fg",
      "vg",
      "finanzgericht",
      "arbeitsgericht",
      "sozialgericht",
    ])
    .optional(),
  name: z.string().max(200).optional(),
  safe_id: z.string().max(100).optional(),
  jurisdiction: z
    .object({
      plaintiffZip: z.string().optional(),
      defendantZip: z.string().optional(),
      disputeValue: z.coerce.number().optional(),
      matter: z.string().max(200).optional(),
    })
    .optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (_ctx, _body, query) => {
    if (query?.safe_id) {
      const court = findCourtBySafeId(query.safe_id);
      return apiSuccess({ court, total: court ? 1 : 0 });
    }
    if (query?.jurisdiction) {
      const result = determineJurisdiction(query.jurisdiction);
      return apiSuccess({ jurisdiction: result });
    }
    const hasFilter = query?.city || query?.state || query?.type || query?.name;
    const courts: CourtEntry[] = hasFilter
      ? searchCourts({
          city: query?.city,
          state: query?.state,
          type: query?.type as CourtEntry["type"] | undefined,
          name: query?.name,
        })
      : [...GERMAN_COURTS, ...AUSTRIAN_COURTS];
    return apiSuccess({ courts, total: courts.length });
  }
);
