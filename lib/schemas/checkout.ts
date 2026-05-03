import { z } from 'zod'

export const checkoutShippingSchema = z.object({
  name:    z.string().trim().min(1, { error: 'Required' }).max(120, { error: 'Too long' }),
  address: z.string().trim().min(1, { error: 'Required' }).max(200, { error: 'Too long' }),
  city:    z.string().trim().min(1, { error: 'Required' }).max(80, { error: 'Too long' }),
  zip:     z.string().trim().regex(/^\d{4,10}$/, { error: 'Digits only (4–10)' }),
})
export type CheckoutShippingInput = z.infer<typeof checkoutShippingSchema>

export const placeOrderSchema = checkoutShippingSchema.extend({
  selectedItemIds: z.array(z.int().positive()).min(1),
})
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
