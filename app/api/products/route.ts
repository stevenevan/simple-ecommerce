import type { NextRequest } from 'next/server'
import { listProducts } from '@/lib/db/queries'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 50

const NO_STORE = { 'Cache-Control': 'no-store' }

function parseIntParam(raw: string | null, fallback: number): number {
  if (raw === null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const limit = Math.min(Math.max(parseIntParam(sp.get('limit'), DEFAULT_LIMIT), 1), MAX_LIMIT)
  const offset = Math.max(parseIntParam(sp.get('offset'), 0), 0)
  const category = sp.get('category') || undefined
  const sort = sp.get('sort') || undefined
  const q = sp.get('q') || undefined

  const rows = listProducts({ category, sort, q, limit, offset })
  return Response.json(rows, { headers: NO_STORE })
}
