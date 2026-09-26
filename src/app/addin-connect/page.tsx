import { parseAddinClient } from "@/lib/addin-dialog";
import { AddinConnect } from "./addin-connect";

/**
 * Office add-in sign-in dialog (Word/Outlook). The middleware only lets a
 * signed-in session (incl. 2FA) reach this page; the page itself issues the
 * short-lived add-in token and hands it to the task pane.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <AddinConnect client={parseAddinClient(params.client)} />;
}
