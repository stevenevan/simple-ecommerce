import { listCategories } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  return Response.json(await listCategories(), { headers: NO_STORE })
}
