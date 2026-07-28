import { Play } from 'lucide-react'
import { Skeleton } from '@/components/states'

/**
 * Skeleton de carregamento da tela do cliente (streaming do App Router).
 * Espelha o layout de <ClientReview> para evitar tela branca enquanto a API
 * responde. A transição de entrada real acontece quando o conteúdo monta.
 */
export default function PublicVideoLoading() {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Play className="size-3.5 fill-current" />
          </span>
          <span className="font-display text-xl leading-none tracking-wide">APROVA</span>
        </div>
        <Skeleton className="h-6 w-28 rounded-full" />
      </header>

      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_400px] lg:gap-6 lg:px-6 lg:py-6">
        {/* LEFT: player */}
        <div className="lg:min-w-0">
          <div className="px-4 pt-4 lg:px-0">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-2 h-9 w-3/4" />
          </div>
          <div className="mt-4 flex gap-2 px-4 lg:px-0">
            <Skeleton className="h-11 flex-1 rounded-lg lg:w-28 lg:flex-none" />
            <Skeleton className="h-11 flex-1 rounded-lg lg:w-28 lg:flex-none" />
          </div>
          <div className="mt-3 px-4 lg:px-0">
            <Skeleton className="aspect-video w-full rounded-xl" />
            <Skeleton className="mt-3 h-6 w-full rounded-full" />
          </div>
        </div>

        {/* RIGHT: comments + ratings */}
        <div className="mt-6 space-y-4 px-4 pb-20 lg:mt-14 lg:px-0">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-7 w-48" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
