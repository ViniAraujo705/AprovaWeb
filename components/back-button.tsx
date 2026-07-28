'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BackButton({ className }: { className?: string }) {
  const router = useRouter()

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/')
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
        className,
      )}
    >
      <ArrowLeft className="size-4" />
      Voltar
    </button>
  )
}
