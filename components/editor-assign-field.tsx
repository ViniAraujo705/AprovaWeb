'use client'

/**
 * Editor responsável pelo vídeo — só o owner atribui (usa a lista de membros
 * da conta); alimenta o cálculo de desempenho do editor. Editor só visualiza.
 */
import { useState } from 'react'
import { Loader2, UserCog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { videoService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import type { TeamMember } from '@/lib/types'

/** Badge somente leitura com o nome do editor responsável (ou "Sem editor"). */
export function EditorAssignBadge({
  editorId,
  members,
  className,
}: {
  editorId: string | null
  members: TeamMember[]
  className?: string
}) {
  const name = members.find((m) => m.id === editorId)?.name || null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border',
        className,
      )}
    >
      <UserCog className="size-3.5" />
      {name || 'Sem editor responsável'}
    </span>
  )
}

/** Seletor editável (owner) para atribuir o editor responsável ao vídeo. */
export function EditorAssignField({
  videoId,
  editorId,
  members,
  onUpdated,
  className,
}: {
  videoId: string
  editorId: string | null
  /** Membros elegíveis (normalmente ativos) para responsabilidade pelo vídeo. */
  members: TeamMember[]
  onUpdated: (editorId: string | null) => void
  className?: string
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(value: string) {
    const next = value || null
    setSaving(true)
    setError(null)
    try {
      const updated = await videoService.assignEditor(videoId, next)
      onUpdated(updated.editorId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atribuir o editor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <UserCog className="size-3.5 shrink-0 text-muted-foreground" />
      <select
        value={editorId ?? ''}
        disabled={saving}
        onChange={(e) => {
          e.stopPropagation()
          change(e.target.value)
        }}
        className="min-h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
      >
        <option value="">Sem editor responsável</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.email}
          </option>
        ))}
      </select>
      {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
