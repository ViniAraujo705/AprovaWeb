'use client'

/**
 * Prazo de entrega do vídeo — visível apenas para a equipe da agência
 * (owner/editor). Nunca deve ser renderizado nas telas do cliente.
 */
import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDeadline, getDeadlineUrgency, type DeadlineUrgency } from '@/lib/format'
import { ApiError } from '@/lib/api'
import { videoService } from '@/lib/services'

const urgencyStyles: Record<DeadlineUrgency, string> = {
  overdue: 'bg-destructive/15 text-destructive ring-1 ring-destructive/30',
  soon: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
  ok: 'bg-secondary text-muted-foreground ring-1 ring-border',
}

/** Badge somente leitura do prazo (usado pelo editor e em contextos read-only). */
export function DeadlineBadge({
  deadline,
  className,
}: {
  deadline: string | null
  className?: string
}) {
  const urgency = getDeadlineUrgency(deadline)
  if (!deadline || !urgency) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border',
          className,
        )}
      >
        <CalendarClock className="size-3.5" />
        Sem prazo
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        urgencyStyles[urgency],
        className,
      )}
    >
      <CalendarClock className="size-3.5" />
      {urgency === 'overdue' ? 'Venceu em' : 'Prazo:'} {formatDeadline(deadline)}
    </span>
  )
}

/**
 * Prazo editável (owner). Clique no badge abre um input de data inline;
 * salva ao perder o foco ou pressionar Enter. Some está dentro de um `<Link>`
 * (cards da lista de vídeos), por isso todo clique interrompe a propagação.
 */
export function DeadlineField({
  videoId,
  deadline,
  onUpdated,
  className,
}: {
  videoId: string
  deadline: string | null
  onUpdated: (deadline: string | null) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // autoFocus sozinho só coloca o cursor no campo — não abre o calendário
  // nativo. showPicker() precisa ser chamado depois que o input já está
  // montado, daí o efeito em vez de fazer isso direto no onClick do botão.
  useEffect(() => {
    if (!editing) return
    try {
      inputRef.current?.showPicker?.()
    } catch {
      // Navegador sem suporte a showPicker() (ex.: Safari mais antigo) — o
      // usuário ainda consegue abrir o calendário clicando no campo focado.
    }
  }, [editing])

  async function save(value: string) {
    setSaving(true)
    setError(null)
    try {
      const isoValue = value ? new Date(`${value}T00:00:00`).toISOString() : null
      const updated = await videoService.updateDeadline(videoId, isoValue)
      onUpdated(updated.deadline)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o prazo.')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div
        className={cn('inline-flex items-center gap-1.5', className)}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <input
          ref={inputRef}
          type="date"
          autoFocus
          defaultValue={deadline ? deadline.slice(0, 10) : ''}
          disabled={saving}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditing(false)
          }}
          className="min-h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:border-primary"
        />
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setEditing(true)
      }}
      title="Definir prazo de entrega"
      className="inline-flex items-center"
    >
      <DeadlineBadge
        deadline={deadline}
        className={cn('transition-colors hover:ring-1 hover:ring-primary/50', className)}
      />
    </button>
  )
}
