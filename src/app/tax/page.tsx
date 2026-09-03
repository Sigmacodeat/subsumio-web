import { permanentRedirect } from "next/navigation";

// /tax → /taxumio (301 permanent redirect — Taxumio is now a standalone product)
export default function TaxRedirect() {
  permanentRedirect("/taxumio");
}
