'use client'

/**
 * Nome do vídeo editável — usado pelo owner (revisão interna) e pelo cliente
 * (tela pública). `onSave` decide qual serviço chamar (`videoService` ou
 * `publicService`) e como refletir o resultado no estado local; este
 * componente só cuida da UI de edição inline.
 */
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'

export function VideoTitleField({
  title,
  onSave,
  className,
}: {
  title: string
  onSave: (title: string) => Promise<void>
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(value: string) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === title) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível renomear o vídeo.')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="min-w-0">
        <input
          type="text"
          autoFocus
          defaultValue={title}
          disabled={saving}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className={cn(
            'w-full min-w-0 border-b border-primary bg-transparent outline-none',
            className,
          )}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Clique para renomear o vídeo"
      className={cn('group flex min-w-0 items-center gap-2 text-left', className)}
    >
      <span className="truncate">{title}</span>
      <Pencil className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
