import { notFound } from 'next/navigation'
import { getProductBySlug } from '@/lib/db/queries'
import { ProductDetail } from './ProductDetail'

export const dynamic = 'force-dynamic'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product) notFound()
  return <ProductDetail product={product} />
}
