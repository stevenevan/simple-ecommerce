'use client'

import { FilterBar } from '@/components/FilterBar'
import { ProductGrid } from './ProductGrid'

export function HomeClient() {
  return (
    <div className="space-y-6">
      <FilterBar />
      <ProductGrid />
    </div>
  )
}
