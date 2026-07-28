import { Loader2, AlertTriangle, Inbox } from 'lucide-react'
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
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-6 text-destructive" />
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
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <span className="text-muted-foreground">{icon ?? <Inbox className="size-7" />}</span>
      <div>
        <p className="font-medium text-foreground">{title}</p>
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
