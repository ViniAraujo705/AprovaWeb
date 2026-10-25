'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  Check,
  CheckSquare2,
  Cloud,
  ImagePlus,
  List,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CheckDayItem, CheckDayNote } from '@/lib/types'
import { checkDayNoteService } from '@/lib/services'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { formatSentAtCompact } from '@/lib/format'
import { ErrorState, LoadingState } from '@/components/states'
import { toast } from '@/lib/toast'

/**
 * Notas antigas: até então o CheckDay vivia SÓ no localStorage do navegador,
 * o que fazia cada aparelho ter as suas (era por isso que o que se escrevia no
 * notebook nunca aparecia no celular). Agora as notas são da conta; estas
 * chaves servem só para subir uma vez o que ficou preso no navegador.
 */
const STORAGE_KEY = 'aprova_checkday_notes'
const MIGRATED_KEY = 'aprova_checkday_migrated'

/**
 * Ids das notas de exemplo que a versão antiga gravava sozinha no navegador de
 * quem nunca editou nada. Não faz sentido subir essas para a conta real.
 */
const SEED_IDS = new Set(['today', 'ideas', 'bela', 'passwords'])

function localId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Notas presas no localStorage que valem a pena subir (as editadas pelo usuário). */
function pendingLocalNotes(): { title: string; body: string; items: CheckDayItem[] }[] {
  if (typeof window === 'undefined') return []
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return []
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved) as {
      id?: string
      title?: string
      body?: string
      items?: CheckDayItem[]
    }[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((note) => !SEED_IDS.has(String(note.id)))
      .map((note) => ({
        title: String(note.title ?? '').trim() || 'Sem título',
        body: String(note.body ?? ''),
        items: Array.isArray(note.items) ? note.items : [],
      }))
  } catch {
    return []
  }
}

function markMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    // localStorage indisponível (ex.: modo privado): sem marca, a próxima
    // visita tenta de novo. Como só sobe quando a conta está vazia, não
    // duplica nada.
  }
}

function notePreview(note: CheckDayNote) {
  const checks = note.items.filter((item) => item.kind === 'check')
  const when = formatSentAtCompact(note.updatedAt)
  if (checks.length) {
    const done = checks.filter((item) => item.checked).length
    return `${done} de ${checks.length} concluídas${when ? ` · ${when}` : ''}`
  }
  return note.body || (when ? `editado ${when}` : 'Nota vazia')
}

export function CheckDayView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [bold, setBold] = useState(false)
  const [saving, setSaving] = useState(0)
  const [busy, setBusy] = useState(false)

  // Um timer por nota: digitar não pode disparar um PATCH por tecla.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const migrating = useRef(false)

  const { data, loading, error, refetch, setData } = useQuery<CheckDayNote[]>(
    (signal) => checkDayNoteService.list(signal),
    [],
    // Enquanto há alteração por salvar, o refetch fica desligado: ele traria a
    // versão do servidor por cima do que está sendo digitado.
    { refetchOnFocus: saving === 0, staleAfterMs: 10_000 },
  )

  const notes = useMemo(() => data ?? [], [data])

  // O salvamento é atrasado; quando ele dispara, o `data` daquele render já
  // está velho. O ref guarda sempre a versão mais recente (as alterações são
  // aplicadas localmente na hora), então o que sobe é o texto atual, não um
  // retrato de 700ms atrás — senão duas edições seguidas perdiam a primeira.
  const notesRef = useRef<CheckDayNote[]>([])
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // Sobe uma única vez as notas que ficaram presas no navegador, e só quando a
  // conta ainda não tem nenhuma — assim ninguém perde o que escreveu antes de
  // o CheckDay passar a ser da conta, e nada é duplicado.
  useEffect(() => {
    if (!data || data.length > 0 || migrating.current) return
    const pending = pendingLocalNotes()
    if (pending.length === 0) {
      markMigrated()
      return
    }
    migrating.current = true
    ;(async () => {
      const created: CheckDayNote[] = []
      try {
        for (const note of pending) {
          created.push(await checkDayNoteService.create(note))
        }
        markMigrated()
        setData(created)
        toast.success(
          'Notas do navegador salvas na conta',
          'Agora elas aparecem também no celular.',
        )
      } catch {
        if (created.length > 0) setData(created)
        toast.error('Não foi possível subir todas as notas antigas', 'Tente atualizar a página.')
      } finally {
        migrating.current = false
      }
    })()
  }, [data, setData])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
    }
  }, [])

  const selectedNote = notes.find((note) => note.id === selectedId) ?? notes[0] ?? null

  const filteredNotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    if (!term) return notes
    return notes.filter((note) =>
      `${note.title} ${note.body} ${note.items.map((item) => item.text).join(' ')}`
        .toLocaleLowerCase('pt-BR')
        .includes(term),
    )
  }, [notes, search])

  /**
   * Aplica a mudança na hora (a digitação não pode esperar a rede) e agenda o
   * salvamento. `saving` alimenta o indicador e segura o refetch.
   */
  function updateNote(id: string, patch: Partial<Omit<CheckDayNote, 'id'>>) {
    setData((current) =>
      (current ?? []).map((note) => (note.id === id ? { ...note, ...patch } : note)),
    )

    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    else setSaving((count) => count + 1)

    timers.current.set(
      id,
      setTimeout(async () => {
        timers.current.delete(id)
        try {
          const latest = notesRef.current.find((note) => note.id === id)
          if (!latest) return
          const saved = await checkDayNoteService.update(id, {
            title: latest.title,
            body: latest.body,
            items: latest.items,
          })
          setData((current) =>
            (current ?? []).map((note) =>
              note.id === id ? { ...note, updatedAt: saved.updatedAt } : note,
            ),
          )
        } catch (err) {
          toast.error(
            'Não foi possível salvar a nota',
            err instanceof ApiError ? err.message : undefined,
          )
        } finally {
          setSaving((count) => Math.max(0, count - 1))
        }
      }, 700),
    )
  }

  async function createNote() {
    setBusy(true)
    try {
      const created = await checkDayNoteService.create({ title: 'Nova nota', body: '', items: [] })
      setData((current) => [created, ...(current ?? [])])
      setSelectedId(created.id)
    } catch (err) {
      toast.error('Não foi possível criar a nota', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function deleteNote() {
    if (!selectedNote) return
    setBusy(true)
    try {
      await checkDayNoteService.remove(selectedNote.id)
      const next = notes.filter((note) => note.id !== selectedNote.id)
      setData(next)
      setSelectedId(next[0]?.id ?? null)
    } catch (err) {
      toast.error('Não foi possível excluir a nota', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  function addItem(kind: CheckDayItem['kind']) {
    if (!selectedNote) return
    updateNote(selectedNote.id, {
      items: [
        ...selectedNote.items,
        { id: localId(), text: kind === 'check' ? 'Novo item' : 'Novo tópico', checked: false, kind },
      ],
    })
  }

  function removeItem(itemId: string) {
    if (!selectedNote) return
    updateNote(selectedNote.id, {
      items: selectedNote.items.filter((item) => item.id !== itemId),
    })
  }

  function addImage() {
    if (!selectedNote) return
    const url = window.prompt('Cole a URL da imagem')?.trim()
    if (!url) return
    updateNote(selectedNote.id, { imageUrl: url })
    checkDayNoteService
      .update(selectedNote.id, { imageUrl: url })
      .catch(() => toast.error('Não foi possível salvar a imagem'))
  }

  if (loading && !data) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoadingState label="Carregando CheckDay…" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-10">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">CheckDay</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Notas, listas e prioridades do seu dia — salvas na sua conta, iguais no computador e no
            celular.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {saving > 0 ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> salvando…
              </>
            ) : (
              <>
                <Cloud className="size-3.5" /> salvo na conta
              </>
            )}
          </span>
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            aria-label="Atualizar notas"
            title="Buscar as alterações feitas em outro aparelho"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      <section className="grid min-h-[650px] overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/5 md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border bg-muted/40 p-3 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-1 pb-3">
            <h2 className="text-base font-semibold text-foreground">CheckDay</h2>
            <button
              type="button"
              onClick={createNote}
              disabled={busy}
              aria-label="Nova nota"
              title="Nova nota"
              className="grid size-8 place-items-center rounded-lg bg-secondary text-secondary-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              <PencilLine className="size-4" />
            </button>
          </div>
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="buscar nota..."
              className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            />
          </label>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {filteredNotes.map((note) => {
              const checks = note.items.filter((item) => item.kind === 'check')
              const isActive = note.id === selectedNote?.id
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedId(note.id)}
                  className={cn(
                    'w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                    isActive ? 'bg-secondary' : 'hover:bg-muted/60',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {checks.length > 0 && (
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full',
                          checks.every((item) => item.checked) ? 'bg-emerald-500' : 'bg-amber-500',
                        )}
                      />
                    )}
                    <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {note.title || 'Sem título'}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{notePreview(note)}</p>
                </button>
              )
            })}
            {filteredNotes.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {notes.length === 0 ? 'Nenhuma nota ainda.' : 'Nenhuma nota encontrada.'}
              </p>
            )}
          </div>
        </aside>

        {selectedNote ? (
          <article className="flex min-w-0 flex-col bg-card">
            <div className="flex items-center gap-1 border-b border-border px-4 py-2.5 sm:px-6">
              <ToolbarButton label="Adicionar checklist" onClick={() => addItem('check')}>
                <CheckSquare2 className="size-4" />
              </ToolbarButton>
              <ToolbarButton label="Adicionar lista" onClick={() => addItem('bullet')}>
                <List className="size-4" />
              </ToolbarButton>
              <ToolbarButton label="Negrito" active={bold} onClick={() => setBold((value) => !value)}>
                <Bold className="size-4" />
              </ToolbarButton>
              <ToolbarButton label="Inserir imagem" onClick={addImage}>
                <ImagePlus className="size-4" />
              </ToolbarButton>
              <div className="flex-1" />
              <ToolbarButton label="Excluir nota" destructive onClick={deleteNote}>
                <Trash2 className="size-4" />
              </ToolbarButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
              <input
                value={selectedNote.title}
                onChange={(event) => updateNote(selectedNote.id, { title: event.target.value })}
                aria-label="Título da nota"
                className="w-full bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Título"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedNote.updatedAt ? `editado ${formatSentAtCompact(selectedNote.updatedAt)}` : 'nota nova'}
              </p>
              <textarea
                value={selectedNote.body}
                onChange={(event) => updateNote(selectedNote.id, { body: event.target.value })}
                rows={2}
                placeholder="Comece a escrever..."
                className={cn(
                  'mt-6 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground',
                  bold && 'font-bold',
                )}
              />
              {selectedNote.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedNote.imageUrl}
                  alt="Imagem da nota"
                  className="mt-3 max-h-64 rounded-xl border border-border object-cover"
                />
              )}
              <div className="mt-3 space-y-1">
                {selectedNote.items.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted/50"
                  >
                    {item.kind === 'check' ? (
                      <button
                        type="button"
                        onClick={() =>
                          updateNote(selectedNote.id, {
                            items: selectedNote.items.map((current) =>
                              current.id === item.id ? { ...current, checked: !current.checked } : current,
                            ),
                          })
                        }
                        aria-label={item.checked ? `Desmarcar ${item.text}` : `Concluir ${item.text}`}
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
                          item.checked
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-input hover:border-muted-foreground',
                        )}
                      >
                        {item.checked && <Check className="size-3.5 stroke-[3]" />}
                      </button>
                    ) : (
                      <span className="ml-1 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    )}
                    <input
                      value={item.text}
                      onChange={(event) =>
                        updateNote(selectedNote.id, {
                          items: selectedNote.items.map((current) =>
                            current.id === item.id ? { ...current, text: event.target.value } : current,
                          ),
                        })
                      }
                      className={cn(
                        'min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none',
                        item.checked && 'text-muted-foreground line-through',
                      )}
                    />
                    {/* Sempre visível: quando dependia de passar o mouse por
                        cima, no celular não havia como apagar um item. */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Apagar ${item.text}`}
                      title="Apagar item"
                      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addItem('check')}
                className="mt-5 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Plus className="size-3.5" /> Adicionar item
              </button>
            </div>
          </article>
        ) : (
          <div className="grid min-h-80 place-items-center bg-card text-sm text-muted-foreground">
            <button
              type="button"
              onClick={createNote}
              disabled={busy}
              className="rounded-lg bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              Criar primeira nota
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function ToolbarButton({
  children,
  label,
  onClick,
  active,
  destructive,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
        active && 'bg-secondary text-foreground',
        destructive && 'hover:text-destructive',
      )}
    >
      {children}
    </button>
  )
}
