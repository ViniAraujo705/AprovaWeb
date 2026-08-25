'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  AlertTriangle,
  Bell,
  Trash2,
  X,
  Clock,
  Users as UsersIcon,
  Contact,
  StickyNote,
  Download,
  UserCheck,
  Video,
  Camera,
  MessagesSquare,
  Package,
  Flag,
  PartyPopper,
  ClipboardList,
} from 'lucide-react'
import { calendarService, clientService, crewService, demandService, teamService } from '@/lib/services'
import type { CalendarActivity, CalendarActivityType, Client, CrewMember, Demand, TeamMember } from '@/lib/types'
import { CALENDAR_ACTIVITY_TYPES, CALENDAR_ACTIVITY_TYPE_LABEL } from '@/lib/calendar-format'
import { WEEKDAYS, dateKey, buildMonthGrid } from '@/lib/format'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { ErrorState, LoadingState } from '@/components/states'
import { FadeIn, motion, AnimatePresence } from '@/components/motion'
import { toast } from '@/lib/toast'
import { cn, shortName } from '@/lib/utils'
import { downloadIcs } from '@/lib/ics'

const CALENDAR_TYPE_META: Record<
  CalendarActivityType,
  { icon: typeof Video; chipBg: string; chipText: string; dot: string }
> = {
  gravacao: { icon: Video, chipBg: 'bg-primary/15 hover:bg-primary/25', chipText: 'text-primary', dot: 'bg-primary' },
  captacao: {
    icon: Camera,
    chipBg: 'bg-sky-500/15 hover:bg-sky-500/25',
    chipText: 'text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
  },
  ensaio: {
    icon: UsersIcon,
    chipBg: 'bg-violet-500/15 hover:bg-violet-500/25',
    chipText: 'text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
  },
  reuniao: {
    icon: MessagesSquare,
    chipBg: 'bg-amber-500/15 hover:bg-amber-500/25',
    chipText: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  entrega: {
    icon: Package,
    chipBg: 'bg-emerald-500/15 hover:bg-emerald-500/25',
    chipText: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  prazo: { icon: Flag, chipBg: 'bg-destructive/15 hover:bg-destructive/25', chipText: 'text-destructive', dot: 'bg-destructive' },
  evento: {
    icon: PartyPopper,
    chipBg: 'bg-pink-500/15 hover:bg-pink-500/25',
    chipText: 'text-pink-600 dark:text-pink-400',
    dot: 'bg-pink-500',
  },
  demanda_interna: {
    icon: ClipboardList,
    chipBg: 'bg-indigo-500/15 hover:bg-indigo-500/25',
    chipText: 'text-indigo-600 dark:text-indigo-400',
    dot: 'bg-indigo-500',
  },
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Domingo 00:00 a sábado 23:59 da semana real de hoje (independente do mês em exibição). */
function currentWeekRange(): { start: Date; end: Date } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

type ExportPeriod = 'week' | 'month' | 'all'

export function CalendarView() {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  // Calendário é compartilhado pela equipe: quem deixa a tela aberta precisa
  // ver o que os outros marcaram, sem depender de recarregar a página na mão.
  const { data: events, loading, error, refetch, setData } = useQuery<CalendarActivity[]>(
    () => calendarService.list(),
    [],
    { refetchOnFocus: true },
  )
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const { data: crewRoster, setData: setCrewRoster } = useQuery<CrewMember[]>(
    (signal) => crewService.list(signal),
    [],
  )
  const teamMembers = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const demands = useQuery<Demand[]>((signal) => demandService.list(signal), [])

  const [modal, setModal] = useState<{ date: Date; event: CalendarActivity | null } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [visibleTypes, setVisibleTypes] = useState<Set<CalendarActivityType>>(
    () => new Set(CALENDAR_ACTIVITY_TYPES),
  )

  function toggleType(type: CalendarActivityType) {
    setVisibleTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart])
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>()
    for (const ev of events ?? []) {
      if (!visibleTypes.has(ev.type)) continue
      const key = dateKey(new Date(ev.startAt))
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt))
    return map
  }, [events, visibleTypes])

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

  function upsertLocal(saved: CalendarActivity) {
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
            Organize gravações, entregas, reuniões e prazos da equipe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
          >
            <Download className="size-4" /> Exportar
          </button>
          <button
            type="button"
            onClick={() => setModal({ date: new Date(), event: null })}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Nova atividade
          </button>
        </div>
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

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CALENDAR_ACTIVITY_TYPES.map((t) => {
          const meta = CALENDAR_TYPE_META[t]
          const active = visibleTypes.has(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              aria-pressed={active}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                active
                  ? cn('border-transparent', meta.chipBg, meta.chipText)
                  : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              <meta.icon className="size-3.5" />
              {CALENDAR_ACTIVITY_TYPE_LABEL[t]}
            </button>
          )
        })}
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
        <FadeIn className="mt-4 overflow-hidden rounded-xl border border-zinc-300 bg-white text-zinc-950 shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[repeat(7,minmax(108px,1fr))] border-b border-zinc-300 bg-zinc-200">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-zinc-700"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[repeat(7,minmax(108px,1fr))]">
                {grid.map((d) => {
                  const key = dateKey(d)
                  const inMonth = d.getMonth() === monthStart.getMonth()
                  const isToday = key === today
                  const dayEvents = eventsByDay.get(key) ?? []
                  return (
                    <div
                      key={key}
                      className={cn(
                        'flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-zinc-200 p-1.5 text-left last:border-r-0 sm:min-h-[110px] sm:p-2',
                        !inMonth && 'bg-zinc-100 text-zinc-400',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setModal({ date: d, event: null })}
                        aria-label={`Adicionar atividade em ${d.toLocaleDateString('pt-BR')}`}
                        className={cn(
                          'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-[11px] font-bold transition-colors hover:bg-zinc-200',
                          isToday
                            ? 'bg-zinc-950 text-white hover:bg-zinc-800'
                            : inMonth
                              ? 'text-zinc-950'
                              : 'text-zinc-400',
                        )}
                      >
                        {d.getDate()}
                      </button>
                      <div className="flex flex-col gap-1">
                        {dayEvents.map((ev) => {
                          const crewNames = ev.crew.map((c) => c.name)
                          const crewLabel = crewNames.map((n) => shortName(n, crewNames)).join(', ')
                          const extra = [crewLabel || null, ev.notes || null].filter(Boolean).join(' · ')
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => setModal({ date: new Date(ev.startAt), event: ev })}
                              className={cn(
                                'flex flex-col rounded-sm border border-zinc-200 px-1.5 py-1 text-left text-zinc-950 transition-colors',
                                CALENDAR_TYPE_META[ev.type].chipBg,
                              )}
                              title={[ev.title, extra].filter(Boolean).join(' — ')}
                            >
                              <span className="flex min-w-0 items-start gap-1 text-[10px] font-bold leading-[1.2] sm:text-[11px]">
                                <span
                                  className={cn(
                                    'mt-0.5 size-1.5 shrink-0 rounded-full',
                                    CALENDAR_TYPE_META[ev.type].dot,
                                  )}
                                />
                                <span className="min-w-0 break-all">{timeLabel(ev.startAt)} {ev.title}</span>
                              </span>
                              {extra && (
                                <span className="mt-0.5 break-all pl-2.5 text-[9px] leading-[1.2] text-zinc-600 sm:text-[10px]">
                                  {extra}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      <AnimatePresence>
        {modal && (
          <EventModal
            date={modal.date}
            event={modal.event}
            clients={clients.data ?? []}
            crewRoster={crewRoster ?? []}
            teamMembers={teamMembers.data ?? []}
            demands={demands.data ?? []}
            onCrewCreated={(created) => setCrewRoster((prev) => [...(prev ?? []), created])}
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
        {exportOpen && (
          <ExportModal
            events={events ?? []}
            crewRoster={crewRoster ?? []}
            monthStart={monthStart}
            monthLabel={monthLabel}
            onClose={() => setExportOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function DayEventsModal({
  date,
  events,
  onClose,
  onSelectEvent,
  onAddNew,
}: {
  date: Date
  events: CalendarActivity[]
  onClose: () => void
  onSelectEvent: (event: CalendarActivity) => void
  onAddNew: () => void
}) {
  const dateLabel = date
    .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    .replace(/^\w/, (c) => c.toUpperCase())

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
        className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-border bg-card p-5"
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">{dateLabel}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            {events.map((ev) => {
              const crewNames = ev.crew.map((c) => c.name)
              const crewLabel = crewNames.map((n) => shortName(n, crewNames)).join(', ')
              const extra = [crewLabel || null, ev.notes || null].filter(Boolean).join(' · ')
              const meta = CALENDAR_TYPE_META[ev.type]
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className={cn('flex flex-col rounded-md px-2.5 py-2 text-left', meta.chipBg)}
                >
                  <span className="flex items-center gap-1.5">
                    <meta.icon className={cn('size-3 shrink-0', meta.chipText)} />
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wide', meta.chipText)}>
                      {CALENDAR_ACTIVITY_TYPE_LABEL[ev.type]}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{timeLabel(ev.startAt)}</span>
                  </span>
                  <span className="mt-1 min-w-0 break-words text-xs font-semibold leading-tight text-foreground">
                    {ev.title}
                  </span>
                  {extra && (
                    <span className="mt-0.5 min-w-0 break-words text-[11px] leading-tight text-muted-foreground">
                      {extra}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onAddNew}
          className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          <Plus className="size-4" /> Nova atividade nesse dia
        </button>
      </motion.div>
    </div>
  )
}

function ExportModal({
  events,
  crewRoster,
  monthStart,
  monthLabel,
  onClose,
}: {
  events: CalendarActivity[]
  crewRoster: CrewMember[]
  monthStart: Date
  monthLabel: string
  onClose: () => void
}) {
  const [period, setPeriod] = useState<ExportPeriod>('month')
  const [crewId, setCrewId] = useState('')
  const [typeFilter, setTypeFilter] = useState<CalendarActivityType | ''>('')

  function download() {
    let range: { start: Date; end: Date } | null = null
    if (period === 'week') {
      range = currentWeekRange()
    } else if (period === 'month') {
      const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
      const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999)
      range = { start, end }
    }

    const crewName = crewId ? crewRoster.find((c) => c.id === crewId)?.name ?? null : null
    const filtered = events.filter((ev) => {
      if (range) {
        const startAt = new Date(ev.startAt)
        if (startAt < range.start || startAt > range.end) return false
      }
      if (crewId && !ev.crew.some((c) => c.id === crewId)) return false
      if (typeFilter && ev.type !== typeFilter) return false
      return true
    })

    if (filtered.length === 0) {
      toast.error('Nenhuma atividade encontrada nesse filtro.')
      return
    }

    const periodSlug = period === 'week' ? 'semana' : period === 'month' ? 'mes' : 'tudo'
    const crewSlug = crewName ? `-${crewName.toLowerCase().replace(/\s+/g, '-')}` : ''
    const typeSlug = typeFilter ? `-${typeFilter.replace(/_/g, '-')}` : ''
    downloadIcs(filtered, `agenda-aprova-${periodSlug}${crewSlug}${typeSlug}.ics`)
    toast.success(`${filtered.length} atividade(s) exportada(s)`)
    onClose()
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
        className="relative flex w-full max-w-md flex-col rounded-xl border border-border bg-card p-5"
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Exportar agenda</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Gera um arquivo .ics pra importar no Google Calendar, Apple Calendar ou Outlook.
        </p>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Período</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ExportPeriod)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="week">Semana atual</option>
            <option value="month">Mês em exibição ({monthLabel})</option>
            <option value="all">Todos os eventos</option>
          </select>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Profissional</span>
          <select
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            {crewRoster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Tipo de atividade</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CalendarActivityType | '')}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            {CALENDAR_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {CALENDAR_ACTIVITY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="size-4" /> Baixar .ics
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DATETIME_PANEL_WIDTH = 288
const DATETIME_PANEL_GAP = 6

/** Substitui o `<input type="datetime-local">` nativo (chrome do SO, foge do tema) por um popover no tema do app. */
function DateTimeField({
  value,
  onChange,
  clearable,
}: {
  value: string
  onChange: (value: string) => void
  clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const parsed = value ? new Date(value) : null
  const [viewMonth, setViewMonth] = useState(() => {
    const base = parsed ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - DATETIME_PANEL_WIDTH - 8))
      setPanelStyle({ top: rect.bottom + DATETIME_PANEL_GAP, left })
    }
    const base = parsed ?? new Date()
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function selectDay(d: Date) {
    const next = new Date(d)
    if (parsed) next.setHours(parsed.getHours(), parsed.getMinutes(), 0, 0)
    else next.setHours(9, 0, 0, 0)
    onChange(toDateTimeLocalValue(next))
  }

  function setTime(hours: number, minutes: number) {
    const next = new Date(parsed ?? new Date())
    next.setHours(hours, minutes, 0, 0)
    onChange(toDateTimeLocalValue(next))
  }

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])
  const displayLabel = parsed
    ? parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Não definido'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-lg border border-border bg-secondary px-2 text-left text-sm outline-none focus:border-primary"
      >
        <span className={cn('flex-1 truncate', parsed ? 'text-foreground' : 'text-muted-foreground')}>{displayLabel}</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ y: -4 }}
                animate={{ y: 0 }}
                exit={{ y: -4 }}
                transition={{ duration: 0.15 }}
                style={{ ...panelStyle, width: DATETIME_PANEL_WIDTH }}
                className="fixed z-50 rounded-xl border border-border bg-card p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-sm font-medium text-foreground">
                    {viewMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
                  {WEEKDAYS.map((w) => (
                    <span key={w}>{w[0]}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-y-0.5">
                  {grid.map((d) => {
                    const inMonth = d.getMonth() === viewMonth.getMonth()
                    const selected = parsed && dateKey(d) === dateKey(parsed)
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => selectDay(d)}
                        className={cn(
                          'mx-auto grid size-8 place-items-center rounded-lg text-xs transition-colors',
                          selected
                            ? 'bg-primary font-semibold text-primary-foreground'
                            : inMonth
                              ? 'text-foreground hover:bg-secondary'
                              : 'text-muted-foreground/40 hover:bg-secondary',
                        )}
                      >
                        {d.getDate()}
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                  <select
                    value={(parsed ?? new Date()).getHours()}
                    onChange={(e) => setTime(Number(e.target.value), (parsed ?? new Date()).getMinutes())}
                    className="min-h-9 flex-1 rounded-lg border border-border bg-secondary px-1.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-muted-foreground">:</span>
                  <select
                    value={(parsed ?? new Date()).getMinutes()}
                    onChange={(e) => setTime((parsed ?? new Date()).getHours(), Number(e.target.value))}
                    className="min-h-9 flex-1 rounded-lg border border-border bg-secondary px-1.5 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {Array.from({ length: 60 }, (_, m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {clearable && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange('')
                        setOpen(false)
                      }}
                      className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Limpar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    OK
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}

function EventModal({
  date,
  event,
  clients,
  crewRoster,
  teamMembers,
  demands,
  onCrewCreated,
  onClose,
  onSaved,
  onDeleted,
}: {
  date: Date
  event: CalendarActivity | null
  clients: Client[]
  crewRoster: CrewMember[]
  teamMembers: TeamMember[]
  demands: Demand[]
  onCrewCreated: (created: CrewMember) => void
  onClose: () => void
  onSaved: (saved: CalendarActivity) => void
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
  const [type, setType] = useState<CalendarActivityType>(event?.type ?? 'gravacao')
  const [demandId, setDemandId] = useState<string | null>(event?.demandId ?? null)
  const [startAt, setStartAt] = useState(toDateTimeLocalValue(defaultStart))
  const [endAt, setEndAt] = useState(toDateTimeLocalValue(defaultEnd))
  const [clientId, setClientId] = useState(event?.clientId ?? '')
  const [crew, setCrew] = useState<CrewMember[]>(event?.crew ?? [])
  const [newCrewName, setNewCrewName] = useState('')
  const [addingCrew, setAddingCrew] = useState(false)
  const addingCrewRef = useRef(false)
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null)
  const [notes, setNotes] = useState(event?.notes ?? '')
  const [titleError, setTitleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notifying, setNotifying] = useState(false)

  // União do roster global com a equipe já salva neste evento — cobre o caso
  // de alguém ter sido removido do roster global depois de já vinculado
  // aqui, pra não sumir da UI (e ser perdido num save sem querer).
  const chipList = useMemo(() => {
    const byId = new Map<string, CrewMember>()
    for (const m of crewRoster) byId.set(m.id, m)
    for (const m of crew) byId.set(m.id, m)
    return Array.from(byId.values())
  }, [crewRoster, crew])

  function toggleCrew(member: CrewMember) {
    setCrew((prev) =>
      prev.some((c) => c.id === member.id)
        ? prev.filter((c) => c.id !== member.id)
        : [...prev, member],
    )
  }

  async function addCrewMember() {
    if (addingCrewRef.current) return
    const trimmed = newCrewName.trim()
    if (!trimmed) return
    addingCrewRef.current = true
    setAddingCrew(true)
    try {
      const created = await crewService.create(trimmed)
      onCrewCreated(created)
      setCrew((prev) => [...prev, created])
      setNewCrewName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível adicionar essa pessoa. Tente novamente.')
    } finally {
      addingCrewRef.current = false
      setAddingCrew(false)
    }
  }

  /**
   * Vincula um integrante com conta real (owner/editor) à gravação, em vez
   * de um nome livre — reaproveita uma entrada do roster já vinculada a esse
   * `userId` se existir, pra não duplicar. Vincular aqui é o que habilita o
   * botão "Notificar equipe vinculada" (ver `notifyCrewMembers`).
   */
  async function addTeamMember(memberId: string) {
    const member = teamMembers.find((m) => m.id === memberId)
    if (!member) return
    const existing = crewRoster.find((c) => c.userId === memberId)
    if (existing) {
      if (!crew.some((c) => c.id === existing.id)) setCrew((prev) => [...prev, existing])
      return
    }
    setAddingMemberId(memberId)
    try {
      const created = await crewService.create(member.name || member.email, memberId)
      onCrewCreated(created)
      setCrew((prev) => [...prev, created])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível vincular esse integrante. Tente novamente.')
    } finally {
      setAddingMemberId(null)
    }
  }

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
      const input = {
        title: trimmed,
        type,
        startAt: new Date(startAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        clientId: clientId || null,
        clientName: client?.name ?? null,
        crew,
        demandId,
        notes: notes.trim() || null,
      }
      const saved = event
        ? await calendarService.update(event.id, input)
        : await calendarService.create(input)
      toast.success(event ? 'Atividade atualizada' : 'Atividade agendada')
      onSaved(saved)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function notifyCrewMembers() {
    if (!event) return
    const linkedIds = crew.filter((c) => c.userId).map((c) => c.id)
    if (linkedIds.length === 0) return
    setNotifying(true)
    setError(null)
    try {
      const { notified } = await calendarService.notifyCrew(event.id, linkedIds)
      toast.success(
        notified > 0
          ? `${notified} ${notified === 1 ? 'pessoa notificada' : 'pessoas notificadas'}`
          : 'Ninguém pôde ser notificado',
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível notificar a equipe. Tente novamente.')
    } finally {
      setNotifying(false)
    }
  }

  async function remove() {
    if (!event) return
    setBusy(true)
    setError(null)
    try {
      await calendarService.remove(event.id)
      toast.success('Atividade removida')
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
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            {event ? 'Editar atividade' : 'Nova atividade'}
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
          <span className="text-sm font-medium text-foreground">Tipo</span>
          <select
            value={type}
            onChange={(e) => {
              const next = e.target.value as CalendarActivityType
              setType(next)
              if (next !== 'demanda_interna') setDemandId(null)
            }}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            {CALENDAR_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {CALENDAR_ACTIVITY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        {type === 'demanda_interna' && (
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Vincular a uma demanda existente{' '}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </span>
            <select
              value={demandId ?? ''}
              onChange={(e) => {
                const id = e.target.value
                if (!id) {
                  setDemandId(null)
                  return
                }
                const demand = demands.find((d) => d.id === id)
                if (!demand) return
                setDemandId(demand.id)
                setTitle(demand.title)
                setClientId(demand.clientId ?? '')
              }}
              className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Nenhuma — criar avulsa</option>
              {demands.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Título</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Gravação — campanha de verão"
            aria-invalid={!!titleError}
            disabled={!!demandId}
            className={cn(
              'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60',
              titleError ? 'border-destructive' : 'border-border',
            )}
          />
          {titleError && <span className="text-xs text-destructive">{titleError}</span>}
          {demandId && (
            <span className="text-xs text-muted-foreground">
              Título e cliente vêm da demanda vinculada — desmarque acima pra editar livremente.
            </span>
          )}
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1 text-sm font-medium text-foreground">
              <Clock className="size-3.5" /> Início
            </span>
            <DateTimeField value={startAt} onChange={setStartAt} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Término</span>
            <DateTimeField value={endAt} onChange={setEndAt} clearable />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <Contact className="size-3.5" /> Cliente <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={!!demandId}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
          >
            <option value="">Sem cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="flex items-center gap-1 text-sm font-medium text-foreground">
            <UsersIcon className="size-3.5" /> Equipe{' '}
            <span className="font-normal text-muted-foreground">(opcional, quem vai)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {chipList.length === 0 && (
              <span className="text-xs text-muted-foreground">
                Ninguém na equipe ainda — adicione um nome abaixo.
              </span>
            )}
            {chipList.map((m) => {
              const selected = crew.some((c) => c.id === m.id)
              const allNames = chipList.map((c) => c.name)
              const label = shortName(m.name, allNames)
              const title = m.userId ? `${m.name} · Conta vinculada da equipe` : m.name
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleCrew(m)}
                  aria-pressed={selected}
                  title={title}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m.userId && <UserCheck className="size-3" />}
                  {label}
                </button>
              )
            })}
          </div>
          {event && crew.some((c) => c.userId) && (
            <button
              type="button"
              onClick={notifyCrewMembers}
              disabled={notifying}
              className="mt-1 inline-flex min-h-8 w-fit items-center gap-1.5 rounded-lg bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              {notifying ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
              Notificar equipe vinculada
            </button>
          )}
          {teamMembers.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) addTeamMember(e.target.value)
                }}
                disabled={addingMemberId !== null}
                className="min-h-9 flex-1 rounded-lg border border-border bg-secondary px-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">+ Vincular conta da equipe…</option>
                {teamMembers
                  .filter((m) => m.name && !crew.some((c) => c.userId === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              {addingMemberId && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
            </div>
          )}
          <div className="mt-1 flex gap-1.5">
            <input
              value={newCrewName}
              onChange={(e) => setNewCrewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCrewMember()
                }
              }}
              placeholder="Adicionar pessoa (não precisa ter conta no Aprova)"
              className="min-h-9 flex-1 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="button"
              onClick={addCrewMember}
              disabled={addingCrew || !newCrewName.trim()}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              {addingCrew ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </button>
          </div>
        </div>

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
                aria-label="Excluir atividade"
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
