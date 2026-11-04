'use client'

/**
 * Nome editável inline — usado no nome do vídeo (revisão interna e tela
 * pública do cliente) e no nome do projeto (página do projeto). `onSave` decide qual serviço chamar (`videoService` ou
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
  errorMessage = 'Não foi possível renomear o vídeo.',
  alwaysShowIcon = false,
  label = 'Renomear',
}: {
  title: string
  onSave: (title: string) => Promise<void>
  className?: string
  errorMessage?: string
  /** Lápis sempre visível (no celular não há hover para revelá-lo). */
  alwaysShowIcon?: boolean
  label?: string
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
      setError(err instanceof ApiError ? err.message : errorMessage)
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
          aria-label={label}
          defaultValue={title}
          disabled={saving}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className={cn(
            'w-full min-w-0 border-b border-primary-ink bg-transparent outline-none',
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
      title={title}
      aria-label={`${label}: ${title}`}
      className={cn('group flex min-w-0 max-w-full items-center gap-2 text-left', className)}
    >
      <span className="min-w-0 truncate">{title}</span>
      <Pencil
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-opacity group-hover:opacity-100',
          alwaysShowIcon ? 'opacity-60' : 'opacity-0',
        )}
      />
    </button>
  )
}
