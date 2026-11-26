'use client'

/**
 * Peças do Kanban inspiradas no fluxo do Trello, no visual do Check:
 * barra flutuante (Caixa de entrada · Planejador · Quadro · Mudar de quadros),
 * Planejador com os prazos dos próximos dias, Caixa de entrada com as
 * notificações e o seletor de fundo do quadro.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Kanban,
  LayoutGrid,
  Loader2,
  Palette,
  Plus,
  Star,
  X,
  ArrowLeftRight,
} from 'lucide-react'
import { demandService, notificationService } from '@/lib/services'
import type { AgendaCard, AppNotification, BoardBackground, KanbanBoard } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn } from '@/lib/utils'
import { useFitViewport } from '@/lib/use-fit-viewport'
import { useAuth } from '@/components/auth-provider'
import { NOTIFICATIONS_CHANGED_EVENT } from '@/components/notification-popups'
import {
  NOTIFICATION_TYPE_ICON as TYPE_ICON,
  describeNotification,
  notificationTimeAgo,
} from '@/lib/notification-format'

/* --------------------------------- fundos --------------------------------- */

/**
 * Fundos do quadro: só tons da identidade Check (verde profundo, musgo,
 * off-white, lima). `dark` diz se o texto sobre o fundo precisa ser claro.
 */
export const BOARD_BACKGROUNDS: Record<BoardBackground, { label: string; style: string; dark: boolean }> = {
  verde: { label: 'Verde Check', style: 'linear-gradient(135deg, #253326 0%, #34503a 100%)', dark: true },
  musgo: { label: 'Musgo', style: 'linear-gradient(135deg, #4f6e4c 0%, #7ea67c 100%)', dark: true },
  grafite: { label: 'Grafite', style: 'linear-gradient(135deg, #17201a 0%, #323b33 100%)', dark: true },
  areia: { label: 'Areia', style: 'linear-gradient(135deg, #efe9dc 0%, #d9cfb8 100%)', dark: false },
  lima: { label: 'Lima', style: 'linear-gradient(135deg, #f1f9df 0%, #d6f593 100%)', dark: false },
  ceu: { label: 'Céu', style: 'linear-gradient(135deg, #e3eef1 0%, #a9c7d3 100%)', dark: false },
}
export const BOARD_BACKGROUND_KEYS = Object.keys(BOARD_BACKGROUNDS) as BoardBackground[]

/** Popover "Fundo do quadro" com a paleta. */
export function BackgroundPicker({
  value,
  onChange,
  onDark,
}: {
  value: BoardBackground | null
  onChange: (v: BoardBackground | null) => void
  /** Botão sobre um fundo escuro (texto claro). */
  onDark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const fit = useFitViewport(panelRef, open)
  useClickOutside(ref, open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Fundo do quadro"
        title="Fundo do quadro"
        className={headerIconButton(onDark, open)}
      >
        <Palette className="size-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          style={fit}
          role="dialog"
          aria-label="Fundo do quadro"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-[14px] border border-border bg-card p-3 text-foreground shadow-xl max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:mt-0 max-sm:w-auto"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fundo do quadro</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className={cn(
                'relative grid h-14 place-items-center rounded-[10px] border bg-background text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary-ink/50',
                value === null ? 'border-primary-ink ring-2 ring-primary-ink/30' : 'border-border',
              )}
            >
              Padrão
              {value === null && <SelectedTick />}
            </button>
            {BOARD_BACKGROUND_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                title={BOARD_BACKGROUNDS[key].label}
                aria-label={BOARD_BACKGROUNDS[key].label}
                style={{ backgroundImage: BOARD_BACKGROUNDS[key].style }}
                className={cn(
                  'relative h-14 rounded-[10px] border transition-transform hover:scale-[1.03]',
                  value === key ? 'border-primary-ink ring-2 ring-primary-ink/30' : 'border-black/10',
                )}
              >
                {value === key && <SelectedTick />}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Vale para toda a equipe.</p>
        </div>
      )}
    </div>
  )
}

function SelectedTick() {
  return (
    <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
      <Check className="size-3" strokeWidth={3} />
    </span>
  )
}

export function headerIconButton(onDark?: boolean, active?: boolean) {
  return cn(
    'grid size-9 shrink-0 place-items-center rounded-[10px] transition-colors',
    onDark
      ? cn('text-white/85 hover:bg-white/15 hover:text-white', active && 'bg-white/15 text-white')
      : cn('text-muted-foreground hover:bg-secondary hover:text-foreground', active && 'bg-secondary text-foreground'),
  )
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onOutside()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOutside()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

/* ------------------------------- favoritos -------------------------------- */

const LS_FAVORITES_KEY = 'aprova:kanban:favoritos'
/** Chave do quadro de produção na lista de favoritos. */
export const PRODUCTION_KEY = 'producao'

/** Quadros favoritos: preferência de cada pessoa, fica neste navegador. */
export function useFavoriteBoards() {
  const [favorites, setFavorites] = useState<string[]>([])
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_FAVORITES_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) setFavorites(parsed.filter((x) => typeof x === 'string'))
    } catch {
      // sem storage
    }
  }, [])
  function toggle(key: string) {
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      try {
        window.localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(next))
      } catch {
        // sem storage
      }
      return next
    })
  }
  return { favorites, toggle, isFavorite: (key: string) => favorites.includes(key) }
}

export function FavoriteButton({
  active,
  onToggle,
  onDark,
}: {
  active: boolean
  onToggle: () => void
  onDark?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? 'Remover dos favoritos' : 'Marcar como favorito'}
      title={active ? 'Remover dos favoritos' : 'Marcar como favorito'}
      className={headerIconButton(onDark)}
    >
      <Star className={cn('size-4', active && 'fill-amber-400 text-amber-400')} />
    </button>
  )
}

/* ---------------------------- barra flutuante ----------------------------- */

export type SidePanel = 'inbox' | 'planner' | null

export function BoardDock({
  panel,
  onPanel,
  boardVisible,
  onToggleBoard,
  unreadCount,
  boards,
  currentId,
  favorites,
  onToggleFavorite,
  onSelectBoard,
  onCreateBoard,
}: {
  panel: SidePanel
  onPanel: (p: SidePanel) => void
  boardVisible: boolean
  onToggleBoard: () => void
  unreadCount: number
  boards: KanbanBoard[]
  currentId: string | null
  favorites: string[]
  onToggleFavorite: (key: string) => void
  onSelectBoard: (id: string | null) => void
  onCreateBoard: () => void
}) {
  const [switching, setSwitching] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, switching, () => setSwitching(false))

  const item = (active: boolean) =>
    cn(
      'relative inline-flex h-10 items-center gap-2 rounded-[12px] px-3 text-sm font-medium transition-colors',
      active
        ? 'bg-secondary text-foreground after:absolute after:inset-x-4 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-primary-ink'
        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
    )

  const entries: { key: string; id: string | null; name: string; count: number | null }[] = [
    { key: PRODUCTION_KEY, id: null, name: 'Produção', count: null },
    ...boards.map((b) => ({ key: b.id, id: b.id, name: b.name, count: b.cardsCount })),
  ]
  const favEntries = entries.filter((e) => favorites.includes(e.key))

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
    >
      <div className="pointer-events-auto relative">
        {switching && (
          <div
            role="dialog"
            aria-label="Mudar de quadro"
            className="absolute bottom-full left-1/2 mb-2 max-h-[min(60vh,26rem)] w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-[16px] border border-border bg-card p-2 shadow-2xl"
          >
            {favEntries.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Favoritos</p>
                {favEntries.map((e) => (
                  <SwitcherRow
                    key={`fav-${e.key}`}
                    entry={e}
                    active={e.id === currentId}
                    favorite
                    onSelect={() => {
                      onSelectBoard(e.id)
                      setSwitching(false)
                    }}
                    onToggleFavorite={() => onToggleFavorite(e.key)}
                  />
                ))}
                <div className="my-1.5 h-px bg-border" />
              </>
            )}
            <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quadros</p>
            {entries.map((e) => (
              <SwitcherRow
                key={e.key}
                entry={e}
                active={e.id === currentId}
                favorite={favorites.includes(e.key)}
                onSelect={() => {
                  onSelectBoard(e.id)
                  setSwitching(false)
                }}
                onToggleFavorite={() => onToggleFavorite(e.key)}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setSwitching(false)
                onCreateBoard()
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="size-4" />
              Novo quadro
            </button>
          </div>
        )}

        <nav
          aria-label="Visões do Kanban"
          className="flex items-center gap-1 rounded-[18px] border border-border bg-card/95 p-1.5 shadow-[0_12px_40px_-12px_rgba(23,32,26,0.45)] backdrop-blur"
        >
          <button
            type="button"
            onClick={() => onPanel(panel === 'inbox' ? null : 'inbox')}
            aria-pressed={panel === 'inbox'}
            className={item(panel === 'inbox')}
          >
            <span className="relative">
              <Inbox className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid min-w-[1rem] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span className="hidden sm:inline">Caixa de entrada</span>
          </button>
          <button
            type="button"
            onClick={() => onPanel(panel === 'planner' ? null : 'planner')}
            aria-pressed={panel === 'planner'}
            className={item(panel === 'planner')}
          >
            <CalendarDays className="size-4" />
            <span className="hidden sm:inline">Planejador</span>
          </button>
          <button type="button" onClick={onToggleBoard} aria-pressed={boardVisible} className={item(boardVisible)}>
            <Kanban className="size-4" />
            <span className="hidden sm:inline">Quadro</span>
          </button>
          <span className="mx-0.5 h-6 w-px bg-border" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setSwitching((s) => !s)}
            aria-haspopup="dialog"
            aria-expanded={switching}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-[12px] border px-3 text-sm font-semibold transition-colors',
              switching
                ? 'border-primary-ink/60 bg-secondary text-foreground'
                : 'border-border text-foreground hover:border-primary-ink/50',
            )}
          >
            <ArrowLeftRight className="size-4" />
            <span className="hidden sm:inline">Mudar de quadros</span>
          </button>
        </nav>
      </div>
    </div>
  )
}

function SwitcherRow({
  entry,
  active,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  entry: { key: string; id: string | null; name: string; count: number | null }
  active: boolean
  favorite: boolean
  onSelect: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-[10px] pr-1 transition-colors',
        active ? 'bg-secondary' : 'hover:bg-secondary/70',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm text-foreground"
      >
        {entry.id === null ? (
          <LayoutGrid className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <Kanban className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className={cn('truncate', active && 'font-semibold')}>{entry.name}</span>
        {entry.count !== null && <span className="text-xs tabular-nums text-muted-foreground">{entry.count}</span>}
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={favorite ? `Tirar ${entry.name} dos favoritos` : `Favoritar ${entry.name}`}
        className={cn(
          'grid size-7 place-items-center rounded-[8px] transition-opacity hover:bg-background',
          favorite ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
        )}
      >
        <Star className={cn('size-3.5', favorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
      </button>
    </div>
  )
}

/* ------------------------------- painel base ------------------------------ */

/** Moldura dos painéis laterais (Planejador, Caixa de entrada). */
export function SidePanelFrame({
  title,
  icon,
  onClose,
  headerExtra,
  children,
  wide,
}: {
  title: string
  icon: React.ReactNode
  onClose: () => void
  headerExtra?: React.ReactNode
  children: React.ReactNode
  /** Quadro escondido: o painel ocupa a área toda. */
  wide?: boolean
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card',
        wide ? 'w-full' : 'w-full lg:w-80 lg:shrink-0',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-display text-base text-foreground">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          {headerExtra}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Fechar ${title}`}
            className="grid size-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

/* ------------------------------- planejador ------------------------------- */

const DAY_MS = 86_400_000
const WEEKDAY = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTHS_SHORT = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * Planejador: os próximos 7 dias a partir de `start`, com os cards que vencem
 * em cada um (de todos os quadros). Na semana atual mostra também os atrasados.
 */
export function PlannerPanel({
  onOpenCard,
  onClose,
  refreshKey,
  wide,
}: {
  onOpenCard: (id: string) => void
  onClose: () => void
  /** Muda quando algum card é salvo, para recarregar os prazos. */
  refreshKey: string
  wide?: boolean
}) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [start, setStart] = useState<Date>(today)
  const isCurrent = start.getTime() === today.getTime()
  const end = new Date(start.getTime() + 7 * DAY_MS - 1)

  const agenda = useQuery<{ days: AgendaCard[]; overdue: AgendaCard[] }>(
    async (signal) => {
      const [days, past] = await Promise.all([
        demandService.agenda(start, end, signal),
        isCurrent
          ? demandService.agenda(new Date(today.getTime() - 60 * DAY_MS), new Date(today.getTime() - 1), signal)
          : Promise.resolve([] as AgendaCard[]),
      ])
      return { days, overdue: past.filter((c) => !c.deadlineDone) }
    },
    [start.getTime(), refreshKey],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaCard[]>()
    for (const c of agenda.data?.days ?? []) {
      const k = dayKey(new Date(c.deadline!))
      map.set(k, [...(map.get(k) ?? []), c])
    }
    return map
  }, [agenda.data])

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS))
  const monthLabel = MONTHS_SHORT[start.getMonth()]

  return (
    <SidePanelFrame
      title="Planejador"
      icon={<CalendarDays className="size-4" />}
      onClose={onClose}
      wide={wide}
    >
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <span className="mr-auto inline-flex items-center gap-1.5 px-1 text-sm font-medium capitalize text-foreground">
          {monthLabel}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </span>
        <button
          type="button"
          onClick={() => setStart(new Date(start.getTime() - 7 * DAY_MS))}
          aria-label="Semana anterior"
          className="grid size-8 place-items-center rounded-[8px] border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setStart(today)}
          disabled={isCurrent}
          className="h-8 rounded-[8px] border border-border px-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary-ink/50 disabled:opacity-50"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setStart(new Date(start.getTime() + 7 * DAY_MS))}
          aria-label="Próxima semana"
          className="grid size-8 place-items-center rounded-[8px] border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {agenda.loading && !agenda.data ? (
        <div className="grid place-items-center py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : agenda.error ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar os prazos.{' '}
          <button type="button" onClick={agenda.refetch} className="font-medium text-primary-ink hover:underline">
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className={cn('px-4 py-3', wide && 'grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3')}>
          {isCurrent && (agenda.data?.overdue.length ?? 0) > 0 && (
            <div className="pb-4">
              <p className="text-sm font-semibold text-danger-ink">Atrasados</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {agenda.data!.overdue.map((c) => (
                  <PlannerCard key={c.id} card={c} overdue onOpen={() => onOpenCard(c.id)} />
                ))}
              </ul>
            </div>
          )}
          {days.map((d, i) => {
            const cards = byDay.get(dayKey(d)) ?? []
            const isToday = d.getTime() === today.getTime()
            const isTomorrow = d.getTime() === today.getTime() + DAY_MS
            return (
              <div key={dayKey(d)} className="pb-4">
                <p className="text-sm text-foreground">
                  {(isToday || isTomorrow) && <span className="mr-1.5 font-semibold">{isToday ? 'Hoje' : 'Amanhã'}</span>}
                  <span className={cn(isToday || isTomorrow ? 'text-muted-foreground' : 'font-semibold')}>
                    {WEEKDAY[d.getDay()]}
                  </span>{' '}
                  <span className="text-muted-foreground">
                    {d.getDate()} de {MONTHS[d.getMonth()]}
                  </span>
                </p>
                {cards.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{i === 0 && isToday ? 'Nada planejado para hoje' : 'Nada planejado'}</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {cards.map((c) => (
                      <PlannerCard key={c.id} card={c} onOpen={() => onOpenCard(c.id)} />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SidePanelFrame>
  )
}

function PlannerCard({ card, overdue, onOpen }: { card: AgendaCard; overdue?: boolean; onOpen: () => void }) {
  const due = new Date(card.deadline!)
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0
  const context = [card.clientName, card.boardName ?? 'Produção'].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-2.5 rounded-[12px] border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary-ink/50"
      >
        <span
          className={cn(
            'mt-1 size-2 shrink-0 rounded-full',
            card.deadlineDone ? 'bg-success' : overdue ? 'bg-danger' : 'bg-warning',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium text-foreground', card.deadlineDone && 'line-through opacity-60')}>
            {card.title}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {overdue
              ? `${due.getDate()}/${String(due.getMonth() + 1).padStart(2, '0')} · ${context}`
              : hasTime
                ? `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')} · ${context}`
                : context}
          </span>
        </span>
      </button>
    </li>
  )
}

/* ---------------------------- caixa de entrada ---------------------------- */

const INBOX_POLL_MS = 45_000

/** Contador de não lidas para o selo da barra flutuante. */
export function useUnreadCount() {
  const unread = useQuery<number>((signal) => notificationService.unreadCount(signal), [])
  useEffect(() => {
    const id = setInterval(() => unread.refetch(), INBOX_POLL_MS)
    const onChanged = () => unread.refetch()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    return () => {
      clearInterval(id)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { count: unread.data ?? 0, refetch: unread.refetch }
}

/**
 * Caixa de entrada: o que chegou para você (cliente comentou, aprovou, pediu
 * ajuste, menções e prazos). Card do Kanban abre aqui mesmo; o resto leva
 * para a tela certa.
 */
export function InboxPanel({
  onOpenCard,
  onClose,
  onChanged,
  wide,
}: {
  onOpenCard: (id: string) => void
  onClose: () => void
  /** Avisa a barra flutuante para atualizar o contador. */
  onChanged: () => void
  wide?: boolean
}) {
  const isOwner = useAuth().user?.teamRole === 'owner'
  const [unreadOnly, setUnreadOnly] = useState(false)
  const list = useQuery<AppNotification[]>((signal) => notificationService.list(unreadOnly, signal), [unreadOnly])
  useEffect(() => {
    const id = setInterval(() => list.refetch(), INBOX_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly])

  const items = list.data ?? []

  function notifyChanged() {
    onChanged()
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
  }

  async function markRead(id: string) {
    list.setData((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)))
    try {
      await notificationService.markRead(id)
    } catch {
      // o próximo poll corrige
    }
    notifyChanged()
  }

  async function markAllRead() {
    list.setData((prev) => (prev ?? []).map((n) => ({ ...n, read: true })))
    try {
      await notificationService.markAllRead()
    } catch {
      // idem
    }
    notifyChanged()
  }

  return (
    <SidePanelFrame title="Caixa de entrada" icon={<Inbox className="size-4" />} onClose={onClose} wide={wide}>
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        {(
          [
            [false, 'Todas'],
            [true, 'Não lidas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setUnreadOnly(value)}
            aria-pressed={unreadOnly === value}
            className={cn(
              'h-8 rounded-[8px] px-2.5 text-xs font-medium transition-colors',
              unreadOnly === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        {items.some((n) => !n.read) && (
          <button type="button" onClick={markAllRead} className="ml-auto text-xs font-medium text-primary-ink hover:underline">
            Marcar tudo como lido
          </button>
        )}
      </div>

      {list.loading && !list.data ? (
        <div className="grid place-items-center py-10 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : list.error ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar.{' '}
          <button type="button" onClick={list.refetch} className="font-medium text-primary-ink hover:underline">
            Tentar de novo
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {unreadOnly ? 'Tudo lido por aqui.' : 'Nada chegou ainda.'}
        </p>
      ) : (
        <ul className={cn('p-2', wide && 'mx-auto max-w-2xl')}>
          {items.map((n) => {
            const Icon = TYPE_ICON[n.type]
            const { subject, text, context, href } = describeNotification(n, isOwner)
            const body = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-foreground">
                    <span className="font-semibold">{subject}</span> {text}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{context}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{notificationTimeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-ink" aria-label="Não lida" />}
              </>
            )
            const rowClass = cn(
              'flex w-full items-start gap-3 rounded-[12px] px-2.5 py-2.5 text-left transition-colors hover:bg-secondary/70',
              !n.read && 'bg-primary/10',
            )
            return (
              <li key={n.id}>
                {n.demand ? (
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => {
                      if (!n.read) void markRead(n.id)
                      onOpenCard(n.demand!.id)
                    }}
                  >
                    {body}
                  </button>
                ) : (
                  <Link
                    href={href}
                    className={rowClass}
                    onClick={() => {
                      if (!n.read) void markRead(n.id)
                    }}
                  >
                    {body}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SidePanelFrame>
  )
}
