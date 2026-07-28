import { cn } from '@/lib/utils'
import { statusLabel, type VideoStatus } from '@/lib/types'

const styles: Record<VideoStatus, string> = {
  pendente: 'bg-primary text-primary-foreground',
  aprovado: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  ajuste: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  erro: 'bg-destructive/15 text-destructive ring-1 ring-destructive/30',
}

export function StatusBadge({
  status,
  className,
}: {
  status: VideoStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        styles[status],
        className,
      )}
    >
      {status === 'pendente' && (
        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      )}
      {statusLabel[status]}
    </span>
  )
}
