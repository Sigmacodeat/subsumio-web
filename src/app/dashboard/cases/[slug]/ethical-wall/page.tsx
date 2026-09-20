import { redirect } from "next/navigation";

/** The ethical wall is managed with the rest of a matter's access. */
export default async function EthicalWallPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/dashboard/matter-access?case=${encodeURIComponent(decodeURIComponent(slug))}`);
}
