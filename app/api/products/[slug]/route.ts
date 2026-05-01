import { getProductBySlug } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) {
    return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }
  return Response.json(product, { headers: NO_STORE })
}
