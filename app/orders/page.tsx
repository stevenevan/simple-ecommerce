'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useOrders } from '@/lib/hooks/useOrders'
import { useMe } from '@/lib/hooks/useMe'
import { formatCurrency } from '@/lib/format'

const ORDERS_DATE_FMT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

function fmtDate(s: string): string {
  // SQLite stores `YYYY-MM-DD HH:MM:SS` (UTC) — make it ISO for the Date ctor.
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  return ORDERS_DATE_FMT.format(new Date(iso))
}

export default function OrdersPage() {
  const me = useMe()
  const orders = useOrders()

  if (me.isLoading || orders.isLoading) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <h1 className="mb-4 text-xl font-semibold">Your orders</h1>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    )
  }

  if (!me.data?.user) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>{' '}
          to view your orders.
        </p>
      </div>
    )
  }

  if (orders.isError) {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <h1 className="mb-4 text-xl font-semibold">Your orders</h1>
        <Card>
          <CardContent className="flex items-center justify-between py-6">
            <span className="text-sm text-muted-foreground">Couldn&apos;t load your orders.</span>
            <Button variant="outline" size="sm" onClick={() => orders.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const list = orders.data?.orders ?? []

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <h1 className="mb-4 text-xl font-semibold">Your orders</h1>
      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">You have no orders yet.</p>
            <Link href="/" className="text-sm underline underline-offset-4">
              Browse products
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((o) => (
            <li key={o.id}>
              <Link
                href={`/checkout/success/${o.id}`}
                className="block rounded border p-4 hover:bg-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Order #{o.id}</span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(o.total_cents)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fmtDate(o.created_at)}</span>
                  <span>
                    {o.item_count} item{o.item_count === 1 ? '' : 's'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
