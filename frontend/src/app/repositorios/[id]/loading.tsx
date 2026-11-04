import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="flex-1" aria-busy="true">
      <div className="mx-auto w-full max-w-300 px-4 py-8 sm:px-8 sm:py-10">
        <Skeleton className="h-4 w-48" />
        <div className="mt-6 flex items-start gap-4">
          <Skeleton className="size-10" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-96" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    </main>
  );
}
