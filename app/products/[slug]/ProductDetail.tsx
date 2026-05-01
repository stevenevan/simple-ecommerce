import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProductImage } from '@/components/ProductImage'
import { ProductSpecs } from '@/components/ProductSpecs'
import { AddToCartButton } from '@/components/AddToCartButton'
import type { Product } from '@/lib/types'

export function ProductDetail({ product }: { product: Product }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <AspectRatio ratio={1} className="overflow-hidden rounded-lg bg-muted">
        <ProductImage product={product} />
      </AspectRatio>

      <div className="space-y-6">
        <ProductSpecs product={product} />
        <AddToCartButton productId={product.id} stock={product.stock} />

        <Tabs defaultValue="description" className="pt-4">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="specs">Specs</TabsTrigger>
          </TabsList>
          <TabsContent value="description" className="pt-3 text-sm text-muted-foreground">
            {product.description}
          </TabsContent>
          <TabsContent value="specs" className="pt-3 text-sm text-muted-foreground">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              <dt className="font-medium text-foreground">Category</dt>
              <dd>{product.category}</dd>
              <dt className="font-medium text-foreground">Stock</dt>
              <dd>{product.stock}</dd>
              <dt className="font-medium text-foreground">SKU</dt>
              <dd>{product.slug}</dd>
            </dl>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
