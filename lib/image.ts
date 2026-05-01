const PLACEHOLDER = '/seed-images/_placeholder.svg'

// Defense-in-depth: product.image_url is a free-form string in the DB. Reject anything
// that isn't a same-origin path to prevent (a) future remotePatterns leak from sourcing
// attacker-controlled bytes through the image optimizer, (b) protocol-relative URLs.
export function safeProductImage(src: string | undefined | null): string {
  if (typeof src !== 'string' || !src.startsWith('/') || src.startsWith('//')) return PLACEHOLDER
  return src
}
