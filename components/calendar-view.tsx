'use client'

import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  AlertTriangle,
  Trash2,
  X,
  Clock,
  User as UserIcon,
  Contact,
  StickyNote,
} from 'lucide-react'
import { calendarService, clientService, teamService } from '@/lib/services'
import type { Client, RecordingEvent, TeamMember } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { ErrorState, LoadingState } from '@/components/states'
import { FadeIn, motion, AnimatePresence } from '@/components/motion'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Toda a grade de 6 semanas (42 dias) que cobre o mês, incluindo sobras do mês anterior/seguinte. */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = monthStart.getDay()
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - firstWeekday)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function CalendarView() {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const { data: events, loading, error, refetch, setData } = useQuery<RecordingEvent[]>(
    () => calendarService.list(),
    [],
  )
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const members = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])

  const [modal, setModal] = useState<{ date: Date; event: RecordingEvent | null } | null>(null)

  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart])
  const eventsByDay = useMemo(() => {
    const map = new Map<string, RecordingEvent[]>()
    for (const ev of events ?? []) {
      const key = dateKey(new Date(ev.startAt))
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt))
    return map
  }, [events])

  const today = dateKey(new Date())
  const monthLabel = monthStart
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase())

  function shiftMonth(delta: number) {
    setMonthStart((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  function goToday() {
    const now = new Date()
    setMonthStart(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  function upsertLocal(saved: RecordingEvent) {
    setData((prev) => {
      const list = prev ?? []
      const idx = list.findIndex((e) => e.id === saved.id)
      if (idx === -1) return [...list, saved]
      const next = [...list]
      next[idx] = saved
      return next
    })
  }

  function removeLocal(id: string) {
    setData((prev) => (prev ?? []).filter((e) => e.id !== id))
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">CALENDÁRIO</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte a escala de gravações da equipe.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ date: new Date(), event: null })}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" /> Nova gravação
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Mês anterior"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Próximo mês"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <h2 className="ml-2 text-lg font-semibold text-foreground">{monthLabel}</h2>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="inline-flex min-h-9 items-center rounded-lg bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          Hoje
        </button>
      </div>

      {loading ? (
        <div className="mt-10 grid place-items-center">
          <LoadingState label="Carregando calendário…" />
        </div>
      ) : error ? (
        <div className="mt-10">
          <ErrorState message={error} onRetry={refetch} />
        </div>
      ) : (
        <FadeIn className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-secondary/50">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d) => {
              const key = dateKey(d)
              const inMonth = d.getMonth() === monthStart.getMonth()
              const isToday = key === today
              const dayEvents = eventsByDay.get(key) ?? []
              const visible = dayEvents.slice(0, 3)
              const overflow = dayEvents.length - visible.length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModal({ date: d, event: null })}
                  className={cn(
                    'flex min-h-[100px] flex-col items-stretch gap-1 border-b border-r border-border p-1.5 text-left transition-colors last:border-r-0 hover:bg-secondary/40 sm:min-h-[120px] sm:p-2',
                    !inMonth && 'bg-secondary/20',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                      isToday
                        ? 'bg-primary text-primary-foreground'
                        : inMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground/50',
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex flex-col gap-1">
                    {visible.map((ev) => (
                      <span
                        key={ev.id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          setModal({ date: new Date(ev.startAt), event: ev })
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation()
                            setModal({ date: new Date(ev.startAt), event: ev })
                          }
                        }}
                        className="truncate rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/25 sm:text-xs"
                        title={ev.title}
                      >
                        {timeLabel(ev.startAt)} {ev.title}
                      </span>
                    ))}
                    {overflow > 0 && (
                      <span className="px-1.5 text-[10px] text-muted-foreground">
                        +{overflow} mais
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </FadeIn>
      )}

      <AnimatePresence>
        {modal && (
          <EventModal
            date={modal.date}
            event={modal.event}
            clients={clients.data ?? []}
            members={members.data ?? []}
            onClose={() => setModal(null)}
            onSaved={(saved) => {
              upsertLocal(saved)
              setModal(null)
            }}
            onDeleted={(id) => {
              removeLocal(id)
              setModal(null)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EventModal({
  date,
  event,
  clients,
  members,
  onClose,
  onSaved,
  onDeleted,
}: {
  date: Date
  event: RecordingEvent | null
  clients: Client[]
  members: TeamMember[]
  onClose: () => void
  onSaved: (saved: RecordingEvent) => void
  onDeleted: (id: string) => void
}) {
  const defaultStart = useMemo(() => {
    if (event) return new Date(event.startAt)
    const d = new Date(date)
    d.setHours(10, 0, 0, 0)
    return d
  }, [event, date])
  const defaultEnd = useMemo(() => {
    if (event?.endAt) return new Date(event.endAt)
    const d = new Date(defaultStart)
    d.setHours(d.getHours() + 1)
    return d
  }, [event, defaultStart])

  const [title, setTitle] = useState(event?.title ?? '')
  const [startAt, setStartAt] = useState(toDateTimeLocalValue(defaultStart))
  const [endAt, setEndAt] = useState(toDateTimeLocalValue(defaultEnd))
  const [clientId, setClientId] = useState(event?.clientId ?? '')
  const [memberId, setMemberId] = useState(event?.memberId ?? '')
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function save() {
    const trimmed = title.trim()
    if (!trimmed) {
      setTitleError('Dê um nome pra essa gravação.')
      return
    }
    setTitleError(null)
    setError(null)
    setBusy(true)
    try {
      const client = clients.find((c) => c.id === clientId)
      const member = members.find((m) => m.id === memberId)
      const input = {
        title: trimmed,
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        clientId: clientId || null,
        clientName: client?.name ?? null,
        memberId: memberId || null,
        memberName: member?.name ?? null,
        notes: notes.trim() || null,
      }
      const saved = event
        ? await calendarService.update(event.id, input)
        : await calendarService.create(input)
      toast.success(event ? 'Gravação atualizada' : 'Gravação agendada')
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!event) return
    setBusy(true)
    setError(null)
    try {
      await calendarService.remove(event.id)
      toast.success('Gravação removida')
      onDeleted(event.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover. Tente novamente.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border bg-card p-5"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            {event ? 'Editar gravação' : 'Nova gravação'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Título</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Gravação — campanha de verão"
            aria-invalid={!!titleError}
            className={cn(
              'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
              titleError ? 'border-destructive' : 'border-border',
            )}
          />
          {titleError && <span className="text-xs text-destructive">{titleError}</span>}
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-sm font-medium text-foreground">
              <Clock className="size-3.5" /> Início
            </span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-secondary px-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Término</span>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-secondary px-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <Contact className="size-3.5" /> Cliente <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <UserIcon className="size-3.5" /> Responsável{' '}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Ninguém atribuído</option>
            {members
              .filter((m) => m.status === 'active')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}
                </option>
              ))}
          </select>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <StickyNote className="size-3.5" /> Notas <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Endereço, equipamento, observações…"
            className="resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>

        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          {event &&
            (confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                aria-label="Excluir gravação"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
              </button>
            ))}
          {!confirmingDelete && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Salvar
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
