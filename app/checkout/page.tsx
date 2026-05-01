'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from '@tanstack/react-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCart } from '@/lib/hooks/useCart'
import { useMe } from '@/lib/hooks/useMe'
import { useCreateOrder } from './_hooks/useCreateOrder'
import { checkoutShippingSchema, type CheckoutShippingInput } from '@/lib/schemas/checkout'
import { formatCurrency } from '@/lib/format'
import { safeProductImage } from '@/lib/image'

export default function CheckoutPage() {
  const router = useRouter()
  const me = useMe()
  const cart = useCart()
  const createOrder = useCreateOrder()

  // Flash-of-skeleton-before-redirect is intentional — page is client-only by
  // design (plan §8.3 D12).
  useEffect(() => {
    if (me.isFetched && !me.data?.user) router.replace('/login')
  }, [me.isFetched, me.data?.user, router])

  const form = useForm({
    defaultValues: { name: '', address: '', city: '', zip: '' } satisfies CheckoutShippingInput,
    validators: { onChange: checkoutShippingSchema },
    onSubmit: async ({ value }) => {
      try {
        const { id } = await createOrder.mutateAsync(value)
        router.push(`/checkout/success/${id}`)
      } catch {
        // Toast already fired in useCreateOrder.onError; swallow so TanStack
        // Form doesn't bubble it as an unhandled rejection.
      }
    },
  })

  if (me.isLoading || cart.isLoading) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <Skeleton className="mb-4 h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!me.data?.user) {
    // useEffect will redirect; render nothing to avoid flash of full content.
    return null
  }

  if (cart.isError) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <h1 className="mb-4 text-xl font-semibold">Checkout</h1>
        <Card>
          <CardContent className="flex items-center justify-between py-6">
            <span className="text-sm text-muted-foreground">Couldn&apos;t load your cart.</span>
            <Button variant="outline" size="sm" onClick={() => cart.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const items = cart.data?.items ?? []
  const subtotalCents = cart.data?.subtotalCents ?? 0

  if (items.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <h1 className="mb-4 text-xl font-semibold">Checkout</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            <Link href="/" className="text-sm underline underline-offset-4">
              Browse products
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <h1 className="mb-6 text-xl font-semibold">Checkout</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <h2 className="mb-3 text-sm font-medium">Order summary</h2>
            <ul className="divide-y">
              {items.map((it) => (
                <li key={it.id} className="flex gap-3 py-3">
                  {/* oxlint-disable-next-line nextjs/no-img-element */}
                  <img
                    src={safeProductImage(it.image_url)}
                    alt={it.name}
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded object-cover"
                  />
                  <div className="flex flex-1 flex-col text-sm">
                    <span className="font-medium">{it.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {it.quantity} × {formatCurrency(it.price_cents)}
                    </span>
                  </div>
                  <div className="text-sm font-medium tabular-nums">
                    {formatCurrency(it.line_total_cents)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{formatCurrency(subtotalCents)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <h2 className="mb-3 text-sm font-medium">Shipping</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                form.handleSubmit()
              }}
            >
              <FieldGroup>
                <form.Field name="name">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          autoComplete="name"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="address">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Address</FieldLabel>
                        <Textarea
                          id={field.name}
                          name={field.name}
                          autoComplete="street-address"
                          rows={2}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="city">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>City</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          autoComplete="address-level2"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Field name="zip">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Zip</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          autoComplete="postal-code"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </Field>
                    )
                  }}
                </form.Field>

                <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
                  {([canSubmit, isSubmitting]) => (
                    <Button
                      type="submit"
                      disabled={!canSubmit || isSubmitting || items.length === 0}
                    >
                      {isSubmitting ? 'Placing order…' : 'Place order'}
                    </Button>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
