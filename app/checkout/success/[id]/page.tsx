import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getOrderForUser } from '@/lib/db/queries'
import { OrderSummary } from './OrderSummary'

export const dynamic = 'force-dynamic'

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) notFound()

  const session = await getSession()
  if (!session.user) redirect('/login')

  const data = await getOrderForUser(session.user.id, orderId)
  if (!data) notFound()

  return <OrderSummary order={data.order} items={data.items} />
}
