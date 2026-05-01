// Single source of truth for friendly error messages used by cart + order
// mutation hooks. Keeping one map prevents drift between domains. (Auth uses
// raw server strings, so it doesn't share this map.)

export const friendlyErrors: Record<string, string> = {
  insufficient_stock: 'Not enough stock',
  unauthorized: 'Please sign in',
  not_found: 'Item no longer available',
  invalid_form: 'Invalid input',
  cart_empty: 'Your cart is empty',
  server_error: 'Something went wrong',
  payload_too_large: 'Request too large',
}

export const friendlyOf = (msg: string): string => friendlyErrors[msg] ?? msg
