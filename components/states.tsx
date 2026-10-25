import { Loader2 } from 'lucide-react'
import { Gesture } from '@/components/gestures'
import { cn } from '@/lib/utils'

/** Spinner centralizado para carregamentos de página. */
export function LoadingState({ label = 'Carregando…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground', className)}>
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

/** Bloco de erro amigável com opção de tentar novamente. */
export function ErrorState({
  message = 'Algo deu errado ao carregar os dados.',
  onRetry,
  className,
}: {
  message?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-danger-border bg-danger-soft px-6 py-12 text-center',
        className,
      )}
    >
      <Gesture state="critical" className="h-16 w-auto" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex min-h-10 items-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}

/** Estado vazio (ex.: nenhum vídeo enviado ainda). */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <span className="text-muted-foreground">{icon ?? <Gesture state="empty" className="h-16 w-auto" />}</span>
      <div>
        <p className="font-display text-lg text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** Skeleton simples (bloco pulsante) para listas. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-secondary', className)} />
}
