import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { statusLabel, type VideoStatus } from '@/lib/types'

const styles: Record<VideoStatus, string> = {
  // Selos do sistema de gestos: aguardando = âmbar, aprovado = lima ("Deu
  // check"), ajuste = coral.
  pendente: 'bg-warning-soft text-warning-ink ring-1 ring-warning-border',
  aprovado: 'bg-success text-success-foreground',
  ajuste: 'bg-danger-soft text-danger-ink ring-1 ring-danger-border',
  erro: 'bg-danger-soft text-danger-ink ring-1 ring-danger-border',
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
        <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
      )}
      {status === 'aprovado' && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
      {statusLabel[status]}
    </span>
  )
}
