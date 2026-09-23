import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CorpusLawDetail } from "@/components/dashboard/corpus-law-detail";
import { LAW_KEY_PATTERN, lawSourceByParam } from "@/lib/law-coverage";

export const metadata: Metadata = { title: "Gesetz · Rechtskorpus" };

/**
 * /ops/corpus/gesetz/<quelle>/<nummer> — ein Gesetz im Detail.
 * <quelle>: bundesrecht | landesrecht | deutschland; <nummer>: RIS-
 * Gesetzesnummer (AT) bzw. Kürzel auf gesetze-im-internet.de (DE).
 * Zugang wie jede /ops-Seite über das Ops-Layout (Betreiber + 2FA).
 */
export default async function LawDetailPage({
  params,
}: {
  params: Promise<{ quelle: string; id: string }>;
}) {
  const { quelle, id } = await params;
  const key = decodeURIComponent(id);
  if (!lawSourceByParam(quelle) || !LAW_KEY_PATTERN.test(key)) notFound();
  return (
    <div className="mx-auto w-full max-w-[1440px] p-4 md:p-6 lg:p-8">
      <CorpusLawDetail sourceParam={quelle} lawKey={key} />
    </div>
  );
}
