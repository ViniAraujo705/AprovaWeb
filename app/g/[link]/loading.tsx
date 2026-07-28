import { Play } from 'lucide-react'
import { Skeleton } from '@/components/states'

/**
 * Skeleton de carregamento da galeria pública (streaming do App Router).
 * Espelha o layout de <ProjectGalleryView> para evitar tela branca enquanto a API responde.
 */
export default function ProjectGalleryLoading() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Play className="size-3.5 fill-current" />
          </span>
          <span className="font-display text-xl leading-none tracking-wide">APROVA</span>
        </div>
        <Skeleton className="h-6 w-28 rounded-full" />
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Skeleton className="h-3 w-32" />
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
