const FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCurrency(cents: number): string {
  return FMT.format(cents / 100)
}
