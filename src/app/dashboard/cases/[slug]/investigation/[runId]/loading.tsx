import { PageSkeleton } from "@/components/dashboard/page-skeleton";

export default function Loading() {
  return <PageSkeleton rows={8} className="mx-auto max-w-[1600px]" />;
}
