import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import type { Product } from '@/lib/types'

type Props = { product: Product }

export function ProductSpecs({ product }: Props) {
  const inStock = product.stock > 0
  return (
    <div className="space-y-4">
      <div>
        <Badge variant="secondary">{product.category}</Badge>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{product.name}</h1>
      <p className="text-2xl font-semibold">{formatCurrency(product.price_cents)}</p>
      <p className="text-sm text-muted-foreground">{product.description}</p>
      <p className={inStock ? 'text-sm text-foreground' : 'text-sm text-destructive'}>
        {inStock ? `In stock (${product.stock})` : 'Out of stock'}
      </p>
    </div>
  )
}
