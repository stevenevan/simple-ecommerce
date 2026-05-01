'use client'

import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useMe } from '@/lib/hooks/useMe'
import { useLogout } from '@/lib/hooks/useAuthMutations'

export function HeaderUserMenu() {
  const me = useMe()
  const logout = useLogout()

  if (me.isLoading) {
    return <Skeleton className="h-8 w-16" />
  }

  if (!me.data?.user) {
    return (
      <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        Login
      </Link>
    )
  }

  const { user } = me.data
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        {user.email}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signed in as {user.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout.mutate()}>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
