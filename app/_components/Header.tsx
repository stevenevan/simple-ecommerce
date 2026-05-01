import Link from 'next/link'
import { HeaderUserMenu } from './HeaderUserMenu'
import { CartDrawer } from './CartDrawer'
import { HeaderOrdersLink } from './HeaderOrdersLink'

export default function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold">
          Simple E-Commerce
        </Link>
        <div data-slot="header-right" className="flex items-center gap-2">
          <CartDrawer />
          <HeaderOrdersLink />
          <HeaderUserMenu />
        </div>
      </div>
    </header>
  )
}
