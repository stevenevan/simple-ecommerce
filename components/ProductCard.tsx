'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AspectRatio } from '@/components/ui/aspect-ratio'
import { formatCurrency } from '@/lib/format'
import { safeProductImage } from '@/lib/image'
import type { Product } from '@/lib/types'

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/products/${encodeURIComponent(product.slug)}`} className="group block">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
        <AspectRatio ratio={1}>
          <Image
            src={safeProductImage(product.image_url)}
            alt={product.name}
            width={400}
            height={400}
            className="size-full object-cover"
          />
        </AspectRatio>
        <CardContent className="space-y-1 p-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{product.category}</Badge>
            {product.stock === 0 && <Badge variant="destructive">Out of stock</Badge>}
          </div>
          <h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3>
          <p className="text-base font-semibold">{formatCurrency(product.price_cents)}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
