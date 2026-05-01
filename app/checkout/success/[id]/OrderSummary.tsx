import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import type { OrderRow, OrderItemSnapshot } from '@/lib/types'
import { formatCurrency } from '@/lib/format'

const DATE_FMT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

function fmtDate(s: string): string {
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  return DATE_FMT.format(new Date(iso))
}

type Props = { order: OrderRow; items: OrderItemSnapshot[] }

export function OrderSummary({ order, items }: Props) {
  return (
    <div className="container mx-auto max-w-3xl py-8">
      <h1 className="mb-1 text-xl font-semibold">Order placed</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Order #{order.id} · {fmtDate(order.created_at)}
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <h2 className="mb-3 text-sm font-medium">Items</h2>
            <ul className="divide-y">
              {items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{it.name_snapshot}</span>
                    <span className="text-xs text-muted-foreground">
                      {it.quantity} × {formatCurrency(it.price_cents_snapshot)}
                    </span>
                  </div>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(it.price_cents_snapshot * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium tabular-nums">{formatCurrency(order.total_cents)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-sm">
            <h2 className="mb-3 font-medium">Shipping to</h2>
            <p>{order.shipping_name}</p>
            <p className="whitespace-pre-line text-muted-foreground">{order.shipping_address}</p>
            <p className="text-muted-foreground">
              {order.shipping_city}, {order.shipping_zip}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Back to all products
        </Link>
        <Link href="/orders" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          View all orders
        </Link>
      </div>
    </div>
  )
}
