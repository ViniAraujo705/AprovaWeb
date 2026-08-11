import Image from 'next/image'
import { Skeleton } from '@/components/states'

/**
 * Skeleton de carregamento do portfólio público (streaming do App Router).
 * Espelha o layout de <PublicPortfolioView> para evitar tela branca enquanto a API responde.
 */
export default function PublicPortfolioLoading() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative size-7 shrink-0 overflow-hidden rounded-md">
            <Image src="/logo-check.png" alt="Check" fill className="object-cover" sizes="28px" />
          </span>
          <span className="font-display text-xl leading-none tracking-wide">CHECK</span>
        </div>
        <Skeleton className="h-9 w-9 rounded-full" />
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-10 w-2/3" />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
