'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useCart } from '@/lib/hooks/useCart'
import { useUpdateQty, useRemoveItem } from '@/lib/hooks/useCartMutations'
import { useMe } from '@/lib/hooks/useMe'
import { formatCurrency } from '@/lib/format'
import { safeProductImage } from '@/lib/image'

export function CartDrawer() {
  const { data: me } = useMe()
  const cart = useCart()
  const updateQty = useUpdateQty()
  const removeItem = useRemoveItem()
  const router = useRouter()

  if (!me?.user) {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Sign in to use cart"
        aria-label="Sign in to use cart"
      >
        <ShoppingCart />
      </Button>
    )
  }

  const items = cart.data?.items ?? []
  const count = items.length

  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open cart" />}
      >
        <ShoppingCart />
        {count > 0 && (
          <Badge className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full px-1 text-[10px]">
            {count}
          </Badge>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Your cart is empty.{' '}
              <Link href="/" className="underline underline-offset-4">
                Browse products
              </Link>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((it) => {
                const isPending = updateQty.isPending || removeItem.isPending
                return (
                  <li key={it.id} className="flex gap-3 py-3">
                    {/* Plain <img> by design — 64px thumbnail; ProductImage is sized for 800px detail view. Plan §5.4 + §9. */}
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={safeProductImage(it.image_url)}
                      alt={it.name}
                      width={64}
                      height={64}
                      className="size-16 shrink-0 rounded object-cover"
                    />
                    <div className="flex flex-1 flex-col gap-1">
                      <Link
                        href={`/products/${it.slug}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {it.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(it.price_cents)}
                      </span>
                      <div className="mt-1 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Decrease quantity"
                          disabled={it.quantity <= 1 || isPending}
                          onClick={() =>
                            updateQty.mutate({ id: it.id, quantity: it.quantity - 1 })
                          }
                        >
                          <Minus />
                        </Button>
                        <span className="w-6 text-center text-sm tabular-nums">
                          {it.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="Increase quantity"
                          disabled={it.quantity >= it.stock || isPending}
                          onClick={() =>
                            updateQty.mutate({ id: it.id, quantity: it.quantity + 1 })
                          }
                        >
                          <Plus />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove item"
                          disabled={isPending}
                          className="ml-auto text-muted-foreground"
                          onClick={() => removeItem.mutate({ id: it.id })}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <div className="text-sm font-medium tabular-nums">
                      {formatCurrency(it.line_total_cents)}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <SheetFooter>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(cart.data?.subtotalCents ?? 0)}
            </span>
          </div>
          <Button disabled={items.length === 0} onClick={() => router.push('/checkout')}>
            Checkout
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
