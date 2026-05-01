'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useCategories } from '@/lib/hooks/useCategories'
import { isClientSortKey, type ClientSortKey } from '@/lib/sort'

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_MAX_LEN = 100
const ALL_VALUE = 'all'

const SORT_OPTIONS: { value: ClientSortKey; label: string }[] = [
  { value: 'newest',     label: 'Newest' },
  { value: 'price_asc',  label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'name_asc',   label: 'Name A–Z' },
]

export function FilterBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const category = searchParams.get('category') ?? ''
  const rawSort = searchParams.get('sort')
  const sort: ClientSortKey = isClientSortKey(rawSort) ? rawSort : 'newest'
  const urlQ = searchParams.get('q') ?? ''

  const [qInput, setQInput] = useState(urlQ)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQInput(urlQ)
  }, [urlQ])

  // pathname is Next-derived (usePathname), never user-controlled — safe to interpolate.
  function setParam(name: string, value: string) {
    const next = new URLSearchParams(searchParams.toString())
    if (value === '') next.delete(name)
    else next.set(name, value)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function onSearchChange(value: string) {
    const capped = value.slice(0, SEARCH_MAX_LEN)
    setQInput(capped)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setParam('q', capped.trim()), SEARCH_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const { data: categories } = useCategories()
  const categoryOptions = categories ?? []

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select
        value={category === '' ? ALL_VALUE : category}
        onValueChange={(v) => setParam('category', !v || v === ALL_VALUE ? '' : v)}
      >
        <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All categories</SelectItem>
          {categoryOptions.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(v) => setParam('sort', !v || v === 'newest' ? '' : v)}>
        <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="search"
        placeholder="Search products…"
        value={qInput}
        onChange={(e) => onSearchChange(e.target.value)}
        maxLength={SEARCH_MAX_LEN}
        className="w-full sm:w-64"
      />
    </div>
  )
}
