import { PageSkeleton } from "@/components/dashboard/page-skeleton";

export default function Loading() {
  return <PageSkeleton withStats rows={4} className="mx-auto max-w-[1400px]" />;
}
