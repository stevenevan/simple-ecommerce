'use client'

import { useProducts } from '@/lib/hooks/useProducts'
import { ProductCard } from '@/components/ProductCard'
import { ProductGridSkeleton } from '@/components/ProductGridSkeleton'
import { Button } from '@/components/ui/button'
import type { Product } from '@/lib/types'

const PAGE_LIMIT = 24

export default function Home() {
  const { data, isPending, isError, error, refetch } = useProducts({ limit: PAGE_LIMIT })

  if (isPending) return <ProductGridSkeleton />
  if (isError) return <ErrorState message={error.message} onRetry={() => refetch()} />
  if (!data?.length) return <EmptyState />
  return <Grid items={data} />
}

function Grid({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button onClick={onRetry}>Retry</Button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-16 text-center text-sm text-muted-foreground">
      No products yet.
    </div>
  )
}
