import { z } from 'zod'

export const checkoutShippingSchema = z.object({
  name:    z.string().trim().min(1, { error: 'Required' }).max(120, { error: 'Too long' }),
  address: z.string().trim().min(1, { error: 'Required' }).max(200, { error: 'Too long' }),
  city:    z.string().trim().min(1, { error: 'Required' }).max(80, { error: 'Too long' }),
  zip:     z.string().trim().regex(/^\d{4,10}$/, { error: 'Digits only (4–10)' }),
})
export type CheckoutShippingInput = z.infer<typeof checkoutShippingSchema>

// selectedItemIds: empty array is schema-valid by design; the 'nothing_selected'
// error is thrown in the transaction layer (createOrderForUser), not here.
// Do not add .min(1) — that would re-route empty-selection failures into 'invalid_form'.
export const placeOrderSchema = checkoutShippingSchema.extend({
  selectedItemIds: z.array(z.number().int().positive()),
})
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
