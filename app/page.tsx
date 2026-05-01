import { Suspense } from 'react'
import { HomeClient } from './HomeClient'
import { ProductGridSkeleton } from './ProductGridSkeleton'

export default function Home() {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <HomeClient />
    </Suspense>
  )
}
