'use client'

/**
 * Configuração dos campos personalizados de cadastro de cliente
 * (/configuracoes/campos-cliente). Owner-only: lista, reordena (setas), cria,
 * edita inline e remove (com confirmação) os campos extras que aparecem no
 * formulário de cada cliente (`ClientCustomFieldsForm` em
 * `client-detail-view.tsx`). Mesma estrutura de `RatingQuestionsView`.
 */
import { useState } from 'react'
import {
  ListPlus,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import { clientFieldService } from '@/lib/services'
import type { ClientFieldDefinition } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { toast } from '@/lib/toast'

export function ClientFieldsView() {
  const { data, loading, error, refetch, setData } = useQuery<ClientFieldDefinition[]>(
    (signal) => clientFieldService.list(signal),
    [],
  )
  const fields = [...(data ?? [])].sort((a, b) => a.order - b.order)

  function upsert(field: ClientFieldDefinition) {
    setData((prev) => {
      const list = prev ?? []
      const exists = list.some((f) => f.id === field.id)
      return exists ? list.map((f) => (f.id === field.id ? field : f)) : [...list, field]
    })
  }

  function remove(id: string) {
    setData((prev) => (prev ?? []).filter((f) => f.id !== id))
  }

  /** Troca a ordem entre dois campos adjacentes (setas) e salva ambos via PATCH. */
  async function move(id: string, direction: 'up' | 'down') {
    const index = fields.findIndex((f) => f.id === id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || swapIndex < 0 || swapIndex >= fields.length) return

    const current = fields[index]
    const swapWith = fields[swapIndex]
    // Otimista: já reordena localmente antes da confirmação do backend.
    setData((prev) =>
      (prev ?? []).map((f) => {
        if (f.id === current.id) return { ...f, order: swapWith.order }
        if (f.id === swapWith.id) return { ...f, order: current.order }
        return f
      }),
    )
    try {
      await Promise.all([
        clientFieldService.update(current.id, { order: swapWith.order }),
        clientFieldService.update(swapWith.id, { order: current.order }),
      ])
    } catch {
      refetch()
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">CAMPOS DE CLIENTE</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Campos extras (Instagram, CNPJ, o que fizer sentido pra sua agência) que aparecem no
        cadastro de cada cliente.
      </p>

      <NewFieldForm onCreated={upsert} order={fields.length} />

      <h2 className="mt-8 font-display text-2xl tracking-wide">CAMPOS ATIVOS</h2>
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : fields.length === 0 ? (
          <EmptyState
            icon={<ListPlus className="size-7" />}
            title="Nenhum campo personalizado ainda"
            description="Adicione o primeiro campo para começar a coletar informações extras dos clientes."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <FieldRow
                key={f.id}
                field={f}
                isFirst={i === 0}
                isLast={i === fields.length - 1}
                onMove={(dir) => move(f.id, dir)}
                onChanged={upsert}
                onRemoved={() => remove(f.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NewFieldForm({
  onCreated,
  order,
}: {
  onCreated: (f: ClientFieldDefinition) => void
  order: number
}) {
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = label.trim()
    if (!value) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await clientFieldService.create(value)
      onCreated({ ...created, order: created.order || order })
      setLabel('')
      toast.success('Campo adicionado')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o campo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Plus className="size-4 text-primary" />
        Novo campo
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex: Instagram"
          className="min-h-11 flex-1 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="submit"
          disabled={submitting || !label.trim()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          ADICIONAR
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  )
}

function FieldRow({
  field,
  isFirst,
  isLast,
  onMove,
  onChanged,
  onRemoved,
}: {
  field: ClientFieldDefinition
  isFirst: boolean
  isLast: boolean
  onMove: (direction: 'up' | 'down') => void
  onChanged: (f: ClientFieldDefinition) => void
  onRemoved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.label)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveLabel() {
    const value = draft.trim()
    if (!value || value === field.label) {
      setEditing(false)
      setDraft(field.label)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await clientFieldService.update(field.id, { label: value })
      onChanged(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await clientFieldService.remove(field.id)
      onRemoved()
      toast.success('Campo removido')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao excluir.')
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        {/* Setas de reordenação */}
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={isFirst || busy}
            aria-label="Mover para cima"
            className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={isLast || busy}
            aria-label="Mover para baixo"
            className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        {/* Rótulo (edição inline) */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveLabel()
                  if (e.key === 'Escape') {
                    setDraft(field.label)
                    setEditing(false)
                  }
                }}
                disabled={busy}
                className="min-h-9 w-full rounded-lg border border-primary bg-secondary px-2 text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={saveLabel}
                disabled={busy}
                aria-label="Salvar"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(field.label)
                  setEditing(false)
                }}
                disabled={busy}
                aria-label="Cancelar"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-foreground disabled:opacity-50"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex min-w-0 items-center gap-1.5 truncate text-left text-sm font-medium hover:text-primary"
              title={field.label}
            >
              <Pencil className="size-3 shrink-0 opacity-50" />
              <span className="min-w-0 truncate">{field.label}</span>
            </button>
          )}
        </div>

        {/* Excluir */}
        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-destructive px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="grid size-8 place-items-center rounded-lg bg-secondary text-foreground disabled:opacity-50"
                aria-label="Cancelar exclusão"
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Excluir campo"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 pl-8 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" /> {error}
        </p>
      )}
    </li>
  )
}
