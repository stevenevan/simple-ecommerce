'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useProducts } from './_hooks/useProducts'
import { useCategories } from './_hooks/useCategories'
import { ProductCard } from './ProductCard'
import { ProductGridSkeleton } from './ProductGridSkeleton'
import { Button } from '@/components/ui/button'
import { isClientSortKey, type ClientSortKey } from '@/lib/sort'
import type { Product } from '@/lib/types'

const PAGE_LIMIT = 24

function readSort(v: string | null): ClientSortKey | undefined {
  return isClientSortKey(v) ? v : undefined
}

export function ProductGrid() {
  const sp = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const { data: categories } = useCategories()
  const rawCategory = sp.get('category') || undefined
  // Drop unknown category values — defends against crafted URLs and stale links.
  // While categories are loading, treat as undefined (no filter) rather than blocking the grid.
  const category = rawCategory && categories?.includes(rawCategory) ? rawCategory : undefined

  const sort = readSort(sp.get('sort'))
  const q = sp.get('q') || undefined

  // Spec §"Empty state": "when q || category is set". Clear filters strips ALL params
  // (including sort) — simpler to reason about than per-axis preservation.
  const filtersActive = Boolean(category || q)
  const { data, isPending, isError, error, refetch } = useProducts({ category, sort, q, limit: PAGE_LIMIT })

  if (isPending) return <ProductGridSkeleton />
  if (isError) return <ErrorState message={error.message} onRetry={() => refetch()} />
  if (!data?.length) {
    return filtersActive
      ? <FilteredEmpty onClear={() => router.replace(pathname)} />
      : <EmptyState />
  }
  return <Grid items={data} />
}

function Grid({ items }: { items: Product[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => <ProductCard key={p.id} product={p} />)}
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

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-sm text-muted-foreground">No products match your filters.</p>
      <Button variant="outline" onClick={onClear}>Clear filters</Button>
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
