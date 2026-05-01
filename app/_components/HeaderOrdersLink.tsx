'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { useMe } from '@/lib/hooks/useMe'

export function HeaderOrdersLink() {
  const { data: me } = useMe()
  if (!me?.user) return null
  return (
    <Link href="/orders" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
      Orders
    </Link>
  )
}
