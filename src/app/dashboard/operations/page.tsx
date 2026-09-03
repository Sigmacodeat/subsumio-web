import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { engineHeadersForBrain } from "@/lib/engine";
import { fetchOperationsData, type OperationsData } from "@/lib/operations-data";
import OperationsCockpit from "./operations-cockpit";

export const metadata = { title: "Operations Cockpit" };
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  // Fetch initial data server-side for instant first paint.
  // The client component will use this as initialData for useQuery,
  // then continue polling via the API route.
  let initialData: OperationsData | undefined;
  try {
    const headers = engineHeadersForBrain(user.brainId);
    initialData = await fetchOperationsData(headers, 200);
  } catch {
    // Graceful degradation: client-side query will retry
  }

  return <OperationsCockpit initialData={initialData} />;
}
