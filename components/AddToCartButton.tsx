'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type Props = { productId: number; stock: number }

export function AddToCartButton({ productId: _productId, stock }: Props) {
  const router = useRouter()
  const disabled = stock === 0

  return (
    <Button
      disabled={disabled}
      onClick={() => {
        toast.message('Sign in to add to cart', {
          action: {
            label: 'Sign in',
            onClick: () => router.push('/login'),
          },
        })
      }}
    >
      {disabled ? 'Out of stock' : 'Add to cart'}
    </Button>
  )
}
