import { RepositoryGridSkeleton } from '@/components/catalog/repository-grid';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8 sm:py-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-8">
          <RepositoryGridSkeleton />
        </div>
      </div>
    </main>
  );
}
