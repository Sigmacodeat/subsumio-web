// German market overrides for the partners page (/de/partners).

import { deepMerge } from "./site";
import { PARTNERS } from "./partners";

export const PARTNERS_DE = deepMerge(PARTNERS, {
  metaTitle: "Subsumio Partnerprogramm — für Kanzleiberater in Deutschland",
  tiers: PARTNERS.tiers.map((t) => ({
    ...t,
    desc: t.desc.replace("österreichischen Anwaltschaft", "deutschen Anwaltschaft"),
  })),
});
