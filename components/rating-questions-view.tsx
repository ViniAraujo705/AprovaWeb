'use client'

/**
 * Configuração das perguntas de avaliação da conta (/configuracoes/perguntas).
 * Owner-only: lista, reordena (setas), cria, edita inline e remove (com
 * confirmação) as perguntas usadas na tela de avaliação do cliente.
 */
import { useState } from 'react'
import {
  ListChecks,
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
import { ratingQuestionService } from '@/lib/services'
import type { RatingQuestion } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

export function RatingQuestionsView() {
  const { data, loading, error, refetch, setData } = useQuery<RatingQuestion[]>(
    (signal) => ratingQuestionService.list(signal),
    [],
  )
  const questions = [...(data ?? [])].sort((a, b) => a.order - b.order)

  function upsert(question: RatingQuestion) {
    setData((prev) => {
      const list = prev ?? []
      const exists = list.some((q) => q.id === question.id)
      return exists ? list.map((q) => (q.id === question.id ? question : q)) : [...list, question]
    })
  }

  function remove(id: string) {
    setData((prev) => (prev ?? []).filter((q) => q.id !== id))
  }

  /** Troca a ordem entre duas perguntas adjacentes (setas) e salva ambas via PATCH. */
  async function move(id: string, direction: 'up' | 'down') {
    const index = questions.findIndex((q) => q.id === id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || swapIndex < 0 || swapIndex >= questions.length) return

    const current = questions[index]
    const swapWith = questions[swapIndex]
    // Otimista: já reordena localmente antes da confirmação do backend.
    setData((prev) =>
      (prev ?? []).map((q) => {
        if (q.id === current.id) return { ...q, order: swapWith.order }
        if (q.id === swapWith.id) return { ...q, order: current.order }
        return q
      }),
    )
    try {
      await Promise.all([
        ratingQuestionService.update(current.id, { order: swapWith.order }),
        ratingQuestionService.update(swapWith.id, { order: current.order }),
      ])
    } catch {
      refetch()
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">
        PERGUNTAS DE AVALIAÇÃO
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Essas perguntas aparecem como estrelas na tela de aprovação do cliente.
      </p>

      <NewQuestionForm onCreated={upsert} order={questions.length} />

      <h2 className="mt-8 font-display text-2xl tracking-wide">PERGUNTAS ATIVAS</h2>
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : questions.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-7" />}
            title="Nenhuma pergunta cadastrada"
            description="Adicione a primeira pergunta para começar a coletar notas por categoria."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                question={q}
                isFirst={i === 0}
                isLast={i === questions.length - 1}
                onMove={(dir) => move(q.id, dir)}
                onChanged={upsert}
                onRemoved={() => remove(q.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NewQuestionForm({
  onCreated,
  order,
}: {
  onCreated: (q: RatingQuestion) => void
  order: number
}) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await ratingQuestionService.create(value)
      onCreated({ ...created, order: created.order || order })
      setText('')
      toast.success('Pergunta adicionada')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a pergunta.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Plus className="size-4 text-primary" />
        Nova pergunta
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: Trilha sonora"
          className="min-h-11 flex-1 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
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

function QuestionRow({
  question,
  isFirst,
  isLast,
  onMove,
  onChanged,
  onRemoved,
}: {
  question: RatingQuestion
  isFirst: boolean
  isLast: boolean
  onMove: (direction: 'up' | 'down') => void
  onChanged: (q: RatingQuestion) => void
  onRemoved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question.text)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveText() {
    const value = draft.trim()
    if (!value || value === question.text) {
      setEditing(false)
      setDraft(question.text)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await ratingQuestionService.update(question.id, { text: value })
      onChanged(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive() {
    setBusy(true)
    setError(null)
    try {
      const updated = await ratingQuestionService.update(question.id, { active: !question.active })
      onChanged(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao atualizar.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await ratingQuestionService.remove(question.id)
      onRemoved()
      toast.success('Pergunta removida')
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

        {/* Texto (edição inline) */}
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveText()
                  if (e.key === 'Escape') {
                    setDraft(question.text)
                    setEditing(false)
                  }
                }}
                disabled={busy}
                className="min-h-9 w-full rounded-lg border border-primary bg-secondary px-2 text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={saveText}
                disabled={busy}
                aria-label="Salvar"
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(question.text)
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
              className={cn(
                'flex min-w-0 items-center gap-1.5 truncate text-left text-sm font-medium hover:text-primary',
                !question.active && 'text-muted-foreground line-through',
              )}
            >
              <Pencil className="size-3 shrink-0 opacity-50" />
              <span className="truncate">{question.text}</span>
            </button>
          )}
        </div>

        {/* Ativo/inativo + excluir */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleActive}
            disabled={busy}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50',
              question.active
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                : 'bg-secondary text-muted-foreground ring-1 ring-border',
            )}
          >
            {question.active ? 'Ativa' : 'Inativa'}
          </button>

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
              aria-label="Excluir pergunta"
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
