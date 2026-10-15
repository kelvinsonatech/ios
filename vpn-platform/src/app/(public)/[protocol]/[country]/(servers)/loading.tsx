import { PageSkeleton } from "@/components/public/page-skeleton";

export default function Loading() {
  return <PageSkeleton variant="server" cards={3} />;
}
