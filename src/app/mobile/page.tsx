import { redirect } from "next/navigation";

/**
 * /mobile → redirect to cases (first tab)
 */
export default function MobileRootPage() {
  redirect("/mobile/cases");
}
