import Link from 'next/link'

export default function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-base font-semibold">
          Simple E-Commerce
        </Link>
        <div data-slot="header-right" />
      </div>
    </header>
  )
}
