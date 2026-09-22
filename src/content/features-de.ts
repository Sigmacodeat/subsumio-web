// German market overrides for the features page (/de/features).

import { deepMerge } from "./site";
import { FEATURES_PAGE } from "./features";

export const FEATURES_PAGE_DE = deepMerge(FEATURES_PAGE, {
  metaTitle: "Subsumio Funktionen — KI-Kanzleisoftware für Rechtsanwälte in Deutschland",
});
