'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMe } from '@/lib/hooks/useMe'
import { useAddItem } from '../_hooks/useAddItem'

type Props = { productId: number; stock: number }

export function AddToCartButton({ productId, stock }: Props) {
  const router = useRouter()
  const { data: me } = useMe()
  const addItem = useAddItem()
  const [qty, setQty] = useState(1)

  if (stock === 0) {
    return <Button disabled>Out of stock</Button>
  }

  const clamped = Math.min(Math.max(qty, 1), stock)

  const onAdd = () => {
    if (!me?.user) {
      toast.message('Sign in to add to cart', {
        action: { label: 'Sign in', onClick: () => router.push('/login') },
      })
      return
    }
    addItem.mutate({ productId, quantity: clamped })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Decrease quantity"
        disabled={qty <= 1}
        onClick={() => setQty((q) => Math.max(1, q - 1))}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center tabular-nums">{clamped}</span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Increase quantity"
        disabled={qty >= stock}
        onClick={() => setQty((q) => Math.min(stock, q + 1))}
      >
        <Plus />
      </Button>
      <Button onClick={onAdd} disabled={addItem.isPending}>
        {addItem.isPending ? 'Adding…' : 'Add to cart'}
      </Button>
    </div>
  )
}
