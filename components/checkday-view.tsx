'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  CircleCheck,
  Cloud,
  ImagePlus,
  List,
  Loader2,
  PencilLine,
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

/**
 * O backend exige `title` não vazio. Nota sem nenhum texto vai com este
 * título; na leitura ele é reconhecido e o editor abre vazio, como no Notas
 * do iPhone.
 */
const EMPTY_TITLE = 'Nova nota'

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

/* ------------------------------------------------------------------------ */
/* Documento: a nota é uma sequência de linhas (texto, checklist ou tópico), */
/* como no Notas do iPhone. A primeira linha com texto é o título.            */
/* ------------------------------------------------------------------------ */

type LineKind = 'text' | 'check' | 'bullet'

interface Line {
  id: string
  kind: LineKind
  text: string
  checked: boolean
}

const CHECK_RE = /^- \[( |x|X)\] ?(.*)$/
const BULLET_RE = /^[-•*] (.*)$/

function textLine(text = ''): Line {
  return { id: localId(), kind: 'text', text, checked: false }
}

function parseLine(raw: string): Line {
  const check = CHECK_RE.exec(raw)
  if (check) return { id: localId(), kind: 'check', text: check[2], checked: check[1] !== ' ' }
  const bullet = BULLET_RE.exec(raw)
  if (bullet) return { id: localId(), kind: 'bullet', text: bullet[1], checked: false }
  return textLine(raw)
}

/**
 * Formato salvo: `body` guarda o documento inteiro (título incluso) em
 * markdown simples (`- [ ] `, `- [x] `, `- `), o que preserva a ordem entre
 * texto e checklist. `title` e `items` continuam sendo preenchidos
 * (derivados) para quem lê esses campos.
 *
 * Notas do formato antigo (título separado, corpo em texto puro e itens
 * soltos no fim) são reconhecidas porque a primeira linha do corpo não é o
 * título: aí o editor monta título + corpo + itens, e na primeira edição a
 * nota passa para o formato novo.
 */
function noteToLines(note: CheckDayNote): Line[] {
  const bodyLines = note.body ? note.body.split('\n').map(parseLine) : []
  const firstText = bodyLines.find((line) => line.text.trim())
  const isDocument = !!firstText && firstText.text.trim() === note.title.trim()

  let lines: Line[]
  if (isDocument) {
    lines = bodyLines
  } else {
    const isBlank = note.title === EMPTY_TITLE && !note.body.trim() && note.items.length === 0
    lines = [textLine(isBlank ? '' : note.title), ...bodyLines]
  }

  // Formato antigo: os itens não estão no corpo. No novo, `items` é só
  // derivado do corpo e já está representado nas linhas.
  if (!lines.some((line) => line.kind !== 'text') && note.items.length > 0) {
    lines.push(
      ...note.items.map((item) => ({
        id: localId(),
        kind: item.kind as LineKind,
        text: item.text,
        checked: item.checked,
      })),
    )
  }
  return lines.length > 0 ? lines : [textLine()]
}

function linesToNote(lines: Line[]): Pick<CheckDayNote, 'title' | 'body' | 'items'> {
  const body = lines
    .map((line) => {
      if (line.kind === 'check') return `- [${line.checked ? 'x' : ' '}] ${line.text}`
      if (line.kind === 'bullet') return `- ${line.text}`
      return line.text
    })
    .join('\n')
  const first = lines.find((line) => line.text.trim())
  const items: CheckDayItem[] = lines
    .filter((line) => line.kind !== 'text' && line.text.trim())
    .map((line) => ({
      id: line.id,
      text: line.text.trim(),
      checked: line.checked,
      kind: line.kind as CheckDayItem['kind'],
    }))
  return {
    title: first ? first.text.trim() : EMPTY_TITLE,
    // Documento sem nada além de linhas vazias vira corpo vazio.
    body: first ? body.replace(/\s+$/, '') : '',
    items,
  }
}

function isEmptyNote(note: CheckDayNote) {
  return !note.imageUrl && !note.body.trim() && note.items.length === 0 && note.title === EMPTY_TITLE
}

/** Título e prévia (a linha seguinte com texto) para a lista. */
function noteSummary(note: CheckDayNote) {
  const lines = noteToLines(note).filter((line) => line.text.trim())
  const title = lines[0]?.text.trim() || EMPTY_TITLE
  const checks = lines.filter((line) => line.kind === 'check')
  const next = lines[1]?.text.trim()
  let preview = next || (note.imageUrl ? 'Imagem' : 'Sem texto adicional')
  if (checks.length > 0 && !next) preview = 'Checklist'
  return { title, preview, checks }
}

/* ------------------------------ datas ---------------------------------- */

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function groupLabel(iso: string | null): string {
  if (!iso) return 'Hoje'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Anteriores'
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 7) return 'Últimos 7 dias'
  if (days < 30) return 'Últimos 30 dias'
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function listDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days <= 0) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Ontem'
  if (days < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' })
  return date.toLocaleDateString('pt-BR')
}

function editorDate(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${day} às ${time}`
}

function sortByUpdated(notes: CheckDayNote[]) {
  return [...notes].sort((a, b) => (b.updatedAt ?? '￿').localeCompare(a.updatedAt ?? '￿'))
}

/* ------------------------------------------------------------------------ */

export function CheckDayView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // No celular a tela mostra OU a lista OU a nota aberta (como no iPhone).
  const [mobileEditor, setMobileEditor] = useState(false)
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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

  const notes = useMemo(() => sortByUpdated(data ?? []), [data])

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

  const groups = useMemo(() => {
    const result: { label: string; notes: CheckDayNote[] }[] = []
    for (const note of filteredNotes) {
      const label = groupLabel(note.updatedAt)
      const last = result[result.length - 1]
      if (last && last.label === label) last.notes.push(note)
      else result.push({ label, notes: [note] })
    }
    return result
  }, [filteredNotes])

  /**
   * Aplica a mudança na hora (a digitação não pode esperar a rede) e agenda o
   * salvamento. `saving` alimenta o indicador e segura o refetch. A data local
   * é atualizada junto, então a nota sobe para o topo da lista, como no iPhone.
   */
  function updateNote(id: string, patch: Partial<Omit<CheckDayNote, 'id'>>) {
    const now = new Date().toISOString()
    setData((current) =>
      (current ?? []).map((note) => (note.id === id ? { ...note, ...patch, updatedAt: now } : note)),
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
              note.id === id ? { ...note, updatedAt: saved.updatedAt ?? note.updatedAt } : note,
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

  function cancelPendingSave(id: string) {
    const timer = timers.current.get(id)
    if (!timer) return
    clearTimeout(timer)
    timers.current.delete(id)
    setSaving((count) => Math.max(0, count - 1))
  }

  /**
   * Nota que ficou vazia é descartada ao sair dela (o iPhone faz o mesmo),
   * para a lista não se encher de "Nova nota" em branco.
   */
  function discardIfEmpty(note: CheckDayNote | null) {
    if (!note || !isEmptyNote(note)) return
    cancelPendingSave(note.id)
    setData((current) => (current ?? []).filter((item) => item.id !== note.id))
    checkDayNoteService.remove(note.id).catch(() => {
      // Sem impacto: no pior caso a nota vazia volta no próximo carregamento.
    })
  }

  function openNote(id: string) {
    if (selectedNote && selectedNote.id !== id) discardIfEmpty(selectedNote)
    setSelectedId(id)
    setMobileEditor(true)
  }

  function backToList() {
    discardIfEmpty(selectedNote)
    setMobileEditor(false)
  }

  async function createNote() {
    // Já existe uma nota em branco aberta: só volta o cursor para ela.
    if (selectedNote && isEmptyNote(selectedNote)) {
      setAutoFocusId(selectedNote.id)
      setMobileEditor(true)
      return
    }
    setBusy(true)
    try {
      const created = await checkDayNoteService.create({ title: EMPTY_TITLE, body: '', items: [] })
      setData((current) => [created, ...(current ?? [])])
      setSearch('')
      setSelectedId(created.id)
      setAutoFocusId(created.id)
      setMobileEditor(true)
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
      cancelPendingSave(selectedNote.id)
      await checkDayNoteService.remove(selectedNote.id)
      const next = notes.filter((note) => note.id !== selectedNote.id)
      setData(next)
      setSelectedId(next[0]?.id ?? null)
      setMobileEditor(false)
    } catch (err) {
      toast.error('Não foi possível excluir a nota', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  function setImage(url: string | null) {
    if (!selectedNote) return
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
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Seu dia</p>
          <h1 className="mt-2 font-display text-3xl leading-[1.05] sm:text-4xl">CheckDay</h1>
        </div>
        <div className="flex items-center gap-2">
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
            className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <section className="grid h-[calc(100dvh-11rem)] min-h-[480px] overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/5 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* Lista */}
        <aside
          className={cn(
            'min-h-0 flex-col border-border bg-muted/40 md:flex md:border-r',
            mobileEditor ? 'hidden' : 'flex',
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <h2 className="text-lg font-bold text-foreground">Notas</h2>
            <button
              type="button"
              onClick={createNote}
              disabled={busy}
              aria-label="Nova nota"
              title="Nova nota"
              className="grid size-9 place-items-center rounded-lg text-primary-ink transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <PencilLine className="size-5" />
            </button>
          </div>
          <label className="relative mx-3 mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar"
              className="h-9 w-full rounded-lg bg-secondary/70 pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {groups.map((group) => (
              <div key={group.label} className="mt-3">
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
                <div className="overflow-hidden rounded-xl bg-card/60">
                  {group.notes.map((note, index) => {
                    const summary = noteSummary(note)
                    const isActive = note.id === selectedNote?.id
                    const allDone =
                      summary.checks.length > 0 && summary.checks.every((line) => line.checked)
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => openNote(note.id)}
                        className={cn(
                          'relative block w-full px-3 py-2.5 text-left transition-colors',
                          isActive ? 'md:bg-secondary' : 'hover:bg-secondary/60',
                          index > 0 &&
                            'before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-border',
                        )}
                      >
                        <p className="truncate text-sm font-semibold text-foreground">{summary.title}</p>
                        <p className="mt-0.5 flex min-w-0 gap-2 text-xs text-muted-foreground">
                          <span className="shrink-0 text-foreground/70">{listDate(note.updatedAt)}</span>
                          <span className="truncate">
                            {summary.checks.length > 0 && (
                              <span className={cn(allDone ? 'text-emerald-600' : 'text-amber-600', 'mr-1')}>
                                {summary.checks.filter((line) => line.checked).length}/{summary.checks.length}
                              </span>
                            )}
                            {summary.preview}
                          </span>
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {filteredNotes.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {notes.length === 0 ? 'Nenhuma nota ainda.' : 'Nenhuma nota encontrada.'}
              </p>
            )}
          </div>
          <p className="border-t border-border py-2 text-center text-xs text-muted-foreground">
            {notes.length === 1 ? '1 nota' : `${notes.length} notas`}
          </p>
        </aside>

        {/* Nota aberta */}
        {selectedNote ? (
          <article className={cn('min-h-0 min-w-0 flex-col bg-card md:flex', mobileEditor ? 'flex' : 'hidden')}>
            <NoteEditor
              key={selectedNote.id}
              note={selectedNote}
              autoFocus={autoFocusId === selectedNote.id}
              onAutoFocused={() => setAutoFocusId(null)}
              onChange={(patch) => updateNote(selectedNote.id, patch)}
              onBack={backToList}
              onDelete={deleteNote}
              onImage={setImage}
              busy={busy}
            />
          </article>
        ) : (
          <div
            className={cn(
              'place-items-center bg-card text-sm text-muted-foreground md:grid',
              mobileEditor ? 'grid' : 'hidden',
            )}
          >
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

/* ------------------------------------------------------------------------ */

function NoteEditor({
  note,
  autoFocus,
  onAutoFocused,
  onChange,
  onBack,
  onDelete,
  onImage,
  busy,
}: {
  note: CheckDayNote
  autoFocus: boolean
  onAutoFocused: () => void
  onChange: (patch: Pick<CheckDayNote, 'title' | 'body' | 'items'>) => void
  onBack: () => void
  onDelete: () => void
  onImage: (url: string | null) => void
  busy: boolean
}) {
  const [lines, setLines] = useState<Line[]>(() => noteToLines(note))
  const linesRef = useRef(lines)
  const refs = useRef(new Map<string, HTMLTextAreaElement>())
  const container = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<{ id: string; caret: number } | null>(null)
  const focusedId = useRef<string | null>(null)

  // Alteração vinda de fora (outro aparelho, botão Atualizar): só substitui o
  // que está na tela se o usuário não estiver digitando nesta nota.
  useEffect(() => {
    const incoming = noteToLines(note)
    if (linesToNote(incoming).body === linesToNote(linesRef.current).body) return
    if (container.current?.contains(document.activeElement)) return
    linesRef.current = incoming
    setLines(incoming)
  }, [note])

  useEffect(() => {
    if (!autoFocus) return
    const first = linesRef.current[0]
    if (first) pendingFocus.current = { id: first.id, caret: first.text.length }
    applyFocus()
    onAutoFocused()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  function applyFocus() {
    const target = pendingFocus.current
    if (!target) return
    const el = refs.current.get(target.id)
    if (!el) return
    pendingFocus.current = null
    el.focus()
    const caret = Math.min(target.caret, el.value.length)
    el.setSelectionRange(caret, caret)
  }

  useLayoutEffect(applyFocus)

  function commit(next: Line[], focus?: { id: string; caret: number }) {
    linesRef.current = next
    setLines(next)
    if (focus) pendingFocus.current = focus
    onChange(linesToNote(next))
  }

  function replaceLine(index: number, patch: Partial<Line>) {
    return linesRef.current.map((line, i) => (i === index ? { ...line, ...patch } : line))
  }

  function handleInput(index: number, value: string, caret: number) {
    const line = linesRef.current[index]

    // Colou várias linhas (ou o teclado do celular inseriu \n): quebra em linhas.
    if (value.includes('\n')) {
      const parts = value.split('\n')
      const [firstPart, ...rest] = parts
      const created = rest.map((part, i) => {
        const parsed = parseLine(part)
        // Linha nova numa lista continua a lista, como o Enter.
        if (parsed.kind === 'text' && line.kind !== 'text' && i < rest.length) {
          return { ...parsed, kind: line.kind, checked: false }
        }
        return parsed
      })
      const next = [...linesRef.current]
      next.splice(index, 1, { ...line, text: firstPart }, ...created)
      const lastCreated = created[created.length - 1]
      const tail = value.length - caret
      commit(next, { id: lastCreated.id, caret: Math.max(0, lastCreated.text.length - tail) })
      return
    }

    // Atalhos de digitação: "- " vira tópico e "[] " vira checklist.
    if (line.kind === 'text') {
      const bullet = /^[-*•] /.exec(value)
      if (bullet && !line.text.startsWith(bullet[0])) {
        commit(replaceLine(index, { kind: 'bullet', text: value.slice(2) }), {
          id: line.id,
          caret: Math.max(0, caret - 2),
        })
        return
      }
      const check = /^\[\s?\] /.exec(value)
      if (check) {
        commit(replaceLine(index, { kind: 'check', checked: false, text: value.slice(check[0].length) }), {
          id: line.id,
          caret: Math.max(0, caret - check[0].length),
        })
        return
      }
    }

    commit(replaceLine(index, { text: value }))
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return
    const el = event.currentTarget
    const line = linesRef.current[index]
    const start = el.selectionStart
    const end = el.selectionEnd
    const collapsed = start === end

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // Enter num item vazio sai da lista.
      if (line.kind !== 'text' && line.text === '') {
        commit(replaceLine(index, { kind: 'text', checked: false }), { id: line.id, caret: 0 })
        return
      }
      const before = line.text.slice(0, start)
      const after = line.text.slice(end)
      const created: Line = {
        id: localId(),
        kind: index === 0 && line.kind === 'text' ? 'text' : line.kind,
        text: after,
        checked: false,
      }
      const next = [...linesRef.current]
      next.splice(index, 1, { ...line, text: before }, created)
      commit(next, { id: created.id, caret: 0 })
      return
    }

    if (event.key === 'Backspace' && collapsed && start === 0) {
      // Primeiro apaga o marcador (checklist/tópico); depois junta com a linha de cima.
      if (line.kind !== 'text') {
        event.preventDefault()
        commit(replaceLine(index, { kind: 'text', checked: false }), { id: line.id, caret: 0 })
        return
      }
      if (index > 0) {
        event.preventDefault()
        const prev = linesRef.current[index - 1]
        const next = linesRef.current.filter((_, i) => i !== index)
        next[index - 1] = { ...prev, text: prev.text + line.text }
        commit(next, { id: prev.id, caret: prev.text.length })
      }
      return
    }

    if (event.key === 'Delete' && collapsed && start === line.text.length) {
      const following = linesRef.current[index + 1]
      if (!following) return
      event.preventDefault()
      const next = linesRef.current.filter((_, i) => i !== index + 1)
      next[index] = { ...line, text: line.text + following.text }
      commit(next, { id: line.id, caret: line.text.length })
      return
    }

    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && collapsed && !event.shiftKey) {
      const up = event.key === 'ArrowUp'
      const target = linesRef.current[index + (up ? -1 : 1)]
      if (!target) return
      const singleRow = el.clientHeight < 40
      const atEdge = up ? start === 0 : start === line.text.length
      if (!singleRow && !atEdge) return
      event.preventDefault()
      pendingFocus.current = { id: target.id, caret: up && !singleRow ? target.text.length : start }
      applyFocus()
    }
  }

  function toggleCheck(index: number) {
    const line = linesRef.current[index]
    commit(replaceLine(index, { checked: !line.checked }))
  }

  /** Botões da barra: transformam a linha em que o cursor está (ou criam uma no fim). */
  function toggleKind(kind: 'check' | 'bullet') {
    const current = linesRef.current
    const index = current.findIndex((line) => line.id === focusedId.current)
    if (index === -1) {
      const last = current[current.length - 1]
      if (last && last.kind === 'text' && last.text === '') {
        commit(
          current.map((line) => (line.id === last.id ? { ...line, kind } : line)),
          { id: last.id, caret: 0 },
        )
        return
      }
      const created: Line = { id: localId(), kind, text: '', checked: false }
      commit([...current, created], { id: created.id, caret: 0 })
      return
    }
    const line = current[index]
    const caret = refs.current.get(line.id)?.selectionStart ?? line.text.length
    commit(replaceLine(index, { kind: line.kind === kind ? 'text' : kind, checked: false }), {
      id: line.id,
      caret,
    })
  }

  /** Clique no espaço vazio abaixo do texto: cursor no fim, como no iPhone. */
  function focusEnd(event: React.MouseEvent) {
    if (event.target !== event.currentTarget) return
    const current = linesRef.current
    const last = current[current.length - 1]
    if (last && last.kind === 'text' && last.text === '') {
      pendingFocus.current = { id: last.id, caret: 0 }
      applyFocus()
      return
    }
    const created = textLine()
    commit([...current, created], { id: created.id, caret: 0 })
  }

  const [imageDialog, setImageDialog] = useState(false)
  function addImage() {
    setImageDialog(true)
  }

  // Botões da barra não podem roubar o foco do texto (senão perdemos a linha atual).
  const keepFocus = (event: React.MouseEvent) => event.preventDefault()

  return (
    <>
      {imageDialog && (
        <ImageLinkDialog
          onClose={() => setImageDialog(false)}
          onConfirm={(url) => {
            setImageDialog(false)
            onImage(url)
          }}
        />
      )}
      <div className="flex items-center gap-1 border-b border-border px-2 py-2 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-sm font-medium text-primary-ink hover:bg-secondary md:hidden"
        >
          <ChevronLeft className="size-5" /> Notas
        </button>
        <div className="flex-1" />
        <ToolbarButton label="Checklist" onMouseDown={keepFocus} onClick={() => toggleKind('check')}>
          <CircleCheck className="size-[18px]" />
        </ToolbarButton>
        <ToolbarButton label="Lista com tópicos" onMouseDown={keepFocus} onClick={() => toggleKind('bullet')}>
          <List className="size-[18px]" />
        </ToolbarButton>
        <ToolbarButton label="Inserir imagem" onMouseDown={keepFocus} onClick={addImage}>
          <ImagePlus className="size-[18px]" />
        </ToolbarButton>
        <ToolbarButton label="Apagar nota" destructive disabled={busy} onClick={onDelete}>
          <Trash2 className="size-[18px]" />
        </ToolbarButton>
      </div>

      <div
        ref={container}
        onMouseDown={(event) => {
          // Evita que o clique no vazio tire o foco antes do focusEnd.
          if (event.target === event.currentTarget) event.preventDefault()
        }}
        onClick={focusEnd}
        className="min-h-0 flex-1 cursor-text overflow-y-auto px-5 pt-4 pb-24 sm:px-10"
      >
        <p className="pointer-events-none mb-4 text-center text-xs text-muted-foreground">
          {editorDate(note.updatedAt)}
        </p>
        {lines.map((line, index) => (
          <div key={line.id} className="flex items-start gap-2.5">
            {line.kind === 'check' && (
              <button
                type="button"
                onMouseDown={keepFocus}
                onClick={() => toggleCheck(index)}
                aria-label={line.checked ? `Desmarcar ${line.text}` : `Concluir ${line.text}`}
                className={cn(
                  'mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
                  index === 0 && 'mt-2',
                  line.checked
                    ? 'border-primary-ink bg-primary-ink text-card'
                    : 'border-muted-foreground/60 hover:border-foreground',
                )}
              >
                {line.checked && <Check className="size-3 stroke-[3.5]" />}
              </button>
            )}
            {line.kind === 'bullet' && (
              <span
                aria-hidden
                className={cn('mt-[10px] ml-1.5 mr-1 size-[5px] shrink-0 rounded-full bg-foreground', index === 0 && 'mt-4')}
              />
            )}
            <AutoTextarea
              value={line.text}
              ref={(el) => {
                if (el) refs.current.set(line.id, el)
                else refs.current.delete(line.id)
              }}
              // Guarda a ÚLTIMA linha com cursor (não limpa no blur): no
              // celular, tocar na barra tira o foco do texto antes do clique.
              onFocus={() => {
                focusedId.current = line.id
              }}
              onChange={(event) => handleInput(index, event.target.value, event.target.selectionStart)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              placeholder={index === 0 && lines.length === 1 ? 'Nova nota' : undefined}
              aria-label={index === 0 ? 'Título da nota' : 'Linha da nota'}
              className={cn(
                'min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60',
                index === 0 && 'mb-1 text-2xl font-bold leading-9',
                line.kind === 'check' && line.checked && 'text-muted-foreground',
              )}
            />
          </div>
        ))}
        {note.imageUrl && (
          <div className="group relative mt-4 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={note.imageUrl}
              alt="Imagem da nota"
              className="max-h-80 rounded-xl border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => onImage(null)}
              aria-label="Remover imagem"
              title="Remover imagem"
              className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}

/** Textarea de uma linha que cresce conforme o texto quebra. */
function AutoTextarea({
  ref,
  value,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string
  ref: (el: HTMLTextAreaElement | null) => void
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const fit = () => {
      el.style.height = '0px'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    // A quebra de linha muda com a largura (janela, lista aberta/fechada).
    const observer = new ResizeObserver(fit)
    observer.observe(el.parentElement ?? el)
    return () => observer.disconnect()
  }, [value])
  return (
    <textarea
      {...props}
      rows={1}
      value={value}
      ref={(el) => {
        inner.current = el
        ref(el)
      }}
    />
  )
}

function ToolbarButton({
  children,
  label,
  onClick,
  onMouseDown,
  destructive,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  onMouseDown?: (event: React.MouseEvent) => void
  destructive?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-9 place-items-center rounded-lg text-primary-ink transition-colors hover:bg-secondary disabled:opacity-50',
        destructive && 'text-muted-foreground hover:text-destructive',
      )}
    >
      {children}
    </button>
  )
}

/** Janela do próprio app para colar o link da imagem da nota (no lugar do `window.prompt`). */
function ImageLinkDialog({ onConfirm, onClose }: { onConfirm: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const trimmed = url.trim()
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed)

  useEffect(() => {
    setStatus(looksLikeUrl ? 'loading' : 'idle')
  }, [trimmed, looksLikeUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'ok') onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Inserir imagem"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Inserir imagem</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cole o link de uma imagem (Drive público, site, Pinterest...).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          aria-label="Link da imagem"
          className="mt-4 h-11 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
        />
        <div className="mt-3 grid h-40 place-items-center overflow-hidden rounded-[12px] border border-dashed border-border bg-secondary/40">
          {looksLikeUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={trimmed}
                src={trimmed}
                alt="Prévia"
                onLoad={() => setStatus('ok')}
                onError={() => setStatus('error')}
                className={cn('max-h-36 max-w-full object-contain', status !== 'ok' && 'hidden')}
              />
              {status === 'loading' && <p className="text-xs text-muted-foreground">Carregando prévia…</p>}
              {status === 'error' && (
                <p className="px-4 text-center text-xs text-danger-ink">
                  Não conseguimos abrir essa imagem. Confira se o link é da imagem em si (termina em .jpg, .png...) e se é público.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{trimmed ? 'O link precisa começar com https://' : 'A prévia aparece aqui'}</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={status !== 'ok'}
            className="h-10 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Inserir
          </button>
        </div>
      </form>
    </div>
  )
}
