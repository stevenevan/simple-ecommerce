import Image from 'next/image'
import { safeProductImage } from '@/lib/image'
import type { Product } from '@/lib/types'

type Props = {
  product: Pick<Product, 'image_url' | 'name'>
}

export function ProductImage({ product }: Props) {
  return (
    <Image
      src={safeProductImage(product.image_url)}
      alt={product.name}
      width={800}
      height={800}
      priority
      className="size-full rounded-lg object-cover"
    />
  )
}
