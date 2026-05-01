import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <AspectRatio ratio={1}>
        <Skeleton className="size-full" />
      </AspectRatio>
      <div className="space-y-3">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}
