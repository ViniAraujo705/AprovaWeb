'use client'

/**
 * Dashboard mensal do owner (/dashboard): visão geral da operação no mês.
 *
 * Tudo é calculado aqui a partir das listas que o app já busca (vídeos,
 * projetos, demandas, calendário, equipe e o histórico de notas), no mesmo
 * espírito dos relatórios — não existe endpoint de agregação no backend.
 *
 * O seletor de mês muda o que é "do mês" (entregas, desempenho, feedback,
 * prazo médio). O que é "agora" (projetos ativos, próximas gravações,
 * pendências, saúde e pontos de atenção) sempre olha pro dia de hoje.
 *
 * A lista de vídeos que morava aqui foi para /videos.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  FolderKanban,
  Gauge,
  Hourglass,
  MessageSquareQuote,
  Star,
  TimerReset,
  Users,
  Video as VideoIcon,
  X,
} from 'lucide-react'
import {
  calendarService,
  demandService,
  projectService,
  reportService,
  teamService,
  videoService,
} from '@/lib/services'
import type { CalendarActivity, Demand, Project, RatingsReport, TeamMember, Video } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { CALENDAR_ACTIVITY_TYPE_LABEL } from '@/lib/calendar-format'
import { ErrorState, Skeleton } from '@/components/states'
import { cn } from '@/lib/utils'

const DAY = 24 * 60 * 60 * 1000
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_LONG = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
/** Tipos do calendário que contam como "gravação" no painel. */
const RECORDING_TYPES = new Set(['gravacao', 'captacao', 'ensaio'])
/**
 * Quantos trabalhos ativos (vídeos + demandas) uma pessoa da equipe aguenta
 * ao mesmo tempo. Base da "capacidade da equipe": 100% = todo mundo com
 * esse número de trabalhos em aberto.
 */
const ITEMS_PER_PERSON = 6
const DISMISSED_KEY = 'check:dashboard-dismissed'

type MonthKey = { year: number; month: number }

function monthStart({ year, month }: MonthKey) {
  return new Date(year, month, 1).getTime()
}
function monthEnd({ year, month }: MonthKey) {
  return new Date(year, month + 1, 1).getTime()
}
function shiftMonth({ year, month }: MonthKey, delta: number): MonthKey {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}
function sameMonth(a: MonthKey, b: MonthKey) {
  return a.year === b.year && a.month === b.month
}
function inRange(iso: string | null | undefined, from: number, to: number) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= from && t < to
}
function pad2(n: number) {
  return String(n).padStart(2, '0')
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function formatDecimal(n: number, digits = 1) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}
function joinNames(names: string[], max = 2) {
  if (names.length <= max) return names.join(' e ')
  return `${names.slice(0, max).join(', ')} e mais ${names.length - max}`
}
function monthsSince(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
}

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}
function writeDismissed(value: Record<string, string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(value))
  } catch {}
}

/** Item ainda em aberto (não aprovado nem entregue). */
function isOpenVideo(v: Video) {
  return v.status !== 'aprovado' && v.productionStage !== 'aprovado' && v.productionStage !== 'entregue'
}
function isOpenDemand(d: Demand) {
  return d.productionStage !== 'aprovado' && d.productionStage !== 'entregue'
}

export function MonthlyDashboard() {
  const now = new Date()
  const current: MonthKey = { year: now.getFullYear(), month: now.getMonth() }
  const [selected, setSelected] = useState<MonthKey>(current)

  const videosQ = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const projectsQ = useQuery<Project[]>((signal) => projectService.list(undefined, signal), [])
  const demandsQ = useQuery<Demand[]>((signal) => demandService.list(signal), [])
  const eventsQ = useQuery<CalendarActivity[]>((signal) => calendarService.list(signal), [])
  const membersQ = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  // 13 meses: os 12 do gráfico mais o anterior ao primeiro, pro comparativo.
  const ratingsQ = useQuery<RatingsReport>(
    (signal) =>
      reportService.ratings({ from: new Date(monthStart(shiftMonth(current, -13))).toISOString() }, signal),
    [],
  )

  const loading = videosQ.loading || projectsQ.loading
  const error = videosQ.error || projectsQ.error

  // Só a versão mais recente de cada vídeo conta, e o projeto de exemplo do
  // onboarding fica de fora dos números.
  const videos = useMemo(
    () => (videosQ.data ?? []).filter((v) => v.latestVersionId === v.id && !v.isExample),
    [videosQ.data],
  )
  const projects = useMemo(() => (projectsQ.data ?? []).filter((p) => !p.isExample), [projectsQ.data])
  const demands = demandsQ.data ?? []
  const events = eventsQ.data ?? []
  const members = useMemo(() => (membersQ.data ?? []).filter((m) => m.name && m.status !== 'suspended'), [membersQ.data])
  const generalRatings = useMemo(() => (ratingsQ.data?.ratings ?? []).filter((r) => r.questionId === null), [ratingsQ.data])

  const metrics = useMemo(() => {
    const nowMs = Date.now()
    const from = monthStart(selected)
    const to = monthEnd(selected)

    // Entregas = vídeos aprovados no mês. Vídeo já excluído (liberar
    // armazenamento, excluir projeto) continua contando pela nota geral que
    // ficou no histórico de avaliações.
    const deliveredIn = (a: number, b: number) =>
      videos.filter((v) => v.status === 'aprovado' && inRange(v.approvedAt ?? v.createdAt, a, b)).length +
      generalRatings.filter((r) => r.deleted && inRange(r.createdAt, a, b)).length

    const chart = Array.from({ length: 12 }, (_, i) => {
      const key = shiftMonth(selected, i - 11)
      return { key, count: deliveredIn(monthStart(key), monthEnd(key)) }
    })
    const delivered = chart[11].count
    const previous = deliveredIn(monthStart(shiftMonth(selected, -1)), from)
    const deltaPct = previous > 0 ? ((delivered - previous) / previous) * 100 : null

    // Projetos ativos: com algum vídeo em aberto, ou criados há pouco e
    // ainda sem vídeo (acabaram de começar).
    const openVideos = videos.filter(isOpenVideo)
    const openDemands = demands.filter(isOpenDemand)
    const activeProjectIds = new Set(openVideos.map((v) => v.projectId).filter(Boolean) as string[])
    for (const p of projects) {
      const hasVideos = videos.some((v) => v.projectId === p.id)
      if (!hasVideos && p.createdAt && nowMs - new Date(p.createdAt).getTime() < 30 * DAY) activeProjectIds.add(p.id)
    }
    const activeProjects = projects.filter((p) => activeProjectIds.has(p.id))
    const newProjectsThisMonth = projects.filter((p) =>
      inRange(p.createdAt, monthStart(current), monthEnd(current)),
    ).length

    // Gravações
    const upcomingRecordings = events
      .filter((ev) => RECORDING_TYPES.has(ev.type) && new Date(ev.startAt).getTime() >= nowMs)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
    const recordingsNext7 = upcomingRecordings.filter((ev) => new Date(ev.startAt).getTime() <= nowMs + 7 * DAY).length

    // Atrasos e pendências (sempre "agora")
    type Late = { id: string; title: string }
    const overdue: Late[] = [
      ...openVideos
        .filter((v) => v.deadline && new Date(v.deadline).getTime() < nowMs)
        .map((v) => ({ id: v.id, title: v.title })),
      ...openDemands
        .filter((d) => d.deadline && new Date(d.deadline).getTime() < nowMs)
        .map((d) => ({ id: d.id, title: d.title })),
    ]
    const waitingClient = videos.filter(
      (v) => v.status === 'pendente' && v.createdAt && nowMs - new Date(v.createdAt).getTime() > 3 * DAY,
    )
    const inAdjust = videos.filter((v) => v.status === 'ajuste' && isOpenVideo(v))
    const pendingIds = new Set([...overdue.map((o) => o.id), ...waitingClient.map((v) => v.id), ...inAdjust.map((v) => v.id)])
    const dueSoon = [...openVideos, ...openDemands].filter((i) => {
      if (!i.deadline) return false
      const t = new Date(i.deadline).getTime()
      return t >= nowMs && t <= nowMs + 2 * DAY
    })

    // Capacidade: trabalhos em aberto sobre o que a equipe ativa aguenta.
    const activeItems = openVideos.length + openDemands.length
    const capacityPct = members.length > 0 ? Math.round((activeItems / (members.length * ITEMS_PER_PERSON)) * 100) : null

    // Prazo médio de entrega: do envio do vídeo até a aprovação, nos vídeos
    // aprovados no mês escolhido.
    const approvedInMonth = videos.filter(
      (v) => v.status === 'aprovado' && v.approvedAt && v.createdAt && inRange(v.approvedAt, from, to),
    )
    const avgDeliveryDays =
      approvedInMonth.length > 0
        ? approvedInMonth.reduce(
            (sum, v) => sum + (new Date(v.approvedAt!).getTime() - new Date(v.createdAt!).getTime()) / DAY,
            0,
          ) / approvedInMonth.length
        : null

    // Projetos em risco: algum vídeo atrasado ou vencendo em até 2 dias.
    const riskProjectIds = new Set(
      openVideos
        .filter((v) => v.projectId && v.deadline && new Date(v.deadline).getTime() <= nowMs + 2 * DAY)
        .map((v) => v.projectId as string),
    )

    // Feedback do mês (nota geral dada na aprovação)
    const monthRatings = generalRatings.filter((r) => inRange(r.createdAt, from, to))
    const avgRating = monthRatings.length > 0 ? monthRatings.reduce((s, r) => s + r.score, 0) / monthRatings.length : null
    const satisfiedPct =
      monthRatings.length > 0 ? Math.round((monthRatings.filter((r) => r.score >= 4).length / monthRatings.length) * 100) : null
    const lowRatings = monthRatings.filter((r) => r.score <= 2)
    const testimonial =
      monthRatings.find((r) => r.comment) ?? (sameMonth(selected, current) ? generalRatings.find((r) => r.comment) : undefined) ?? null
    // "Cliente há X meses": o projeto mais antigo do cliente marca o começo.
    let clientSince: string | null = null
    if (testimonial?.clientId) {
      for (const p of projects) {
        if (p.clientId === testimonial.clientId && p.createdAt && (!clientSince || p.createdAt < clientSince)) {
          clientSince = p.createdAt
        }
      }
    }

    // Saúde operacional (0–100): pontualidade 40%, satisfação 30%,
    // folga da equipe 30%. Parte sem dado sai da conta e as outras
    // ganham o peso dela.
    const withDeadline = [...openVideos, ...openDemands].filter((i) => i.deadline)
    const parts: { weight: number; score: number }[] = [
      {
        weight: 40,
        score: withDeadline.length > 0 ? ((withDeadline.length - overdue.length) / withDeadline.length) * 100 : 100,
      },
    ]
    const recentRatings = generalRatings.filter((r) => nowMs - new Date(r.createdAt).getTime() <= 90 * DAY)
    if (recentRatings.length > 0) {
      parts.push({ weight: 30, score: (recentRatings.reduce((s, r) => s + r.score, 0) / recentRatings.length / 5) * 100 })
    }
    if (capacityPct !== null) {
      parts.push({ weight: 30, score: capacityPct <= 85 ? 100 : Math.max(0, 100 - (capacityPct - 85) * 5) })
    }
    const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
    const healthScore = Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight)

    return {
      chart,
      delivered,
      previous,
      deltaPct,
      activeProjects: activeProjects.length,
      newProjectsThisMonth,
      upcomingRecordings: upcomingRecordings.slice(0, 3),
      recordingsNext7,
      overdue,
      waitingClient,
      inAdjust,
      pendingCount: pendingIds.size,
      dueSoon,
      capacityPct,
      avgDeliveryDays,
      riskProjects: riskProjectIds.size,
      monthRatings,
      avgRating,
      satisfiedPct,
      lowRatings,
      testimonial,
      clientSince,
      healthScore,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, projects, demands, events, members, generalRatings, selected.year, selected.month])

  const isCurrentMonth = sameMonth(selected, current)
  const monthLabel = `${MONTHS_LONG[selected.month]} ${selected.year}`

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Visão geral da operação</p>
          <h1 className="mt-1 font-display text-4xl tracking-wide sm:text-5xl">DASHBOARD MENSAL</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe a performance da agência e os pontos de atenção do mês.
          </p>
        </div>
        <MonthPicker value={selected} current={current} onChange={setSelected} />
      </div>

      {error ? (
        <div className="mt-8">
          <ErrorState
            message={error}
            onRetry={() => {
              videosQ.refetch()
              projectsQ.refetch()
            }}
          />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              loading={loading}
              icon={<FolderKanban className="size-5" />}
              tone="primary"
              label="Projetos ativos"
              value={metrics.activeProjects}
              hint={
                metrics.newProjectsThisMonth > 0
                  ? `+${metrics.newProjectsThisMonth} ${metrics.newProjectsThisMonth === 1 ? 'criado' : 'criados'} neste mês`
                  : 'Nenhum novo neste mês'
              }
              href="/projetos"
            />
            <KpiCard
              loading={eventsQ.loading}
              icon={<CalendarDays className="size-5" />}
              tone="neutral"
              label="Próximas gravações"
              value={metrics.recordingsNext7}
              hint="Nos próximos 7 dias"
              href="/calendario"
            />
            <KpiCard
              loading={loading || ratingsQ.loading}
              icon={<VideoIcon className="size-5" />}
              tone="primary"
              label={isCurrentMonth ? 'Conteúdos entregues' : `Entregues em ${MONTHS_SHORT[selected.month].toLowerCase()}`}
              value={metrics.delivered}
              hint={deltaText(metrics.deltaPct, metrics.previous)}
              href="/videos"
            />
            <KpiCard
              loading={loading || demandsQ.loading}
              icon={<Clock className="size-5" />}
              tone={metrics.overdue.length > 0 ? 'warning' : 'neutral'}
              label="Pendências"
              value={metrics.pendingCount}
              hint={
                metrics.overdue.length > 0
                  ? `${plural(metrics.overdue.length, 'entrega atrasada', 'entregas atrasadas')}`
                  : 'Nenhuma entrega atrasada'
              }
              href="/kanban"
            />
          </div>

          {/* Desempenho + Saúde */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-5">
            <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-3">
              <CardHeader
                icon={<BarChart3 className="size-5" />}
                title="Desempenho do mês"
                subtitle="Conteúdos aprovados pelos clientes, mês a mês"
              />
              {loading || ratingsQ.loading ? (
                <Skeleton className="mt-6 h-52 w-full rounded-xl" />
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-5xl leading-none tracking-wide">{metrics.delivered}</span>
                    <span className="text-sm text-muted-foreground">
                      {metrics.delivered === 1 ? 'conteúdo entregue' : 'conteúdos entregues'} em {monthLabel.toLowerCase()}
                    </span>
                    {metrics.deltaPct !== null && <DeltaBadge pct={metrics.deltaPct} />}
                  </div>
                  <DeliveriesChart data={metrics.chart} selected={selected} onSelect={setSelected} current={current} />
                </>
              )}
            </section>

            <HealthCard
              loading={loading || demandsQ.loading || membersQ.loading}
              score={metrics.healthScore}
              capacityPct={metrics.capacityPct}
              avgDeliveryDays={metrics.avgDeliveryDays}
              riskProjects={metrics.riskProjects}
              overdue={metrics.overdue.length}
            />
          </div>

          {/* Gravações + Feedback */}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <CardHeader
                icon={<CalendarDays className="size-5" />}
                title="Próximas gravações"
                subtitle="Agenda da equipe nos próximos dias"
                action={{ href: '/calendario', label: 'Ver calendário' }}
              />
              <div className="mt-4">
                {eventsQ.loading ? (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : metrics.upcomingRecordings.length === 0 ? (
                  <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                    Nenhuma gravação marcada.{' '}
                    <Link href="/calendario" className="font-medium text-primary hover:underline">
                      Agendar no calendário
                    </Link>
                  </p>
                ) : (
                  <ul>
                    {metrics.upcomingRecordings.map((ev) => (
                      <RecordingRow key={ev.id} event={ev} />
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <FeedbackCard
              loading={ratingsQ.loading}
              avg={metrics.avgRating}
              count={metrics.monthRatings.length}
              satisfiedPct={metrics.satisfiedPct}
              testimonial={metrics.testimonial}
              clientSince={metrics.clientSince}
              isCurrentMonth={isCurrentMonth}
              monthLabel={monthLabel}
            />
          </div>

          <AttentionCard
            loading={loading || demandsQ.loading}
            overdue={metrics.overdue}
            waitingClient={metrics.waitingClient}
            inAdjust={metrics.inAdjust}
            dueSoon={metrics.dueSoon}
            capacityPct={metrics.capacityPct}
            lowRatings={isCurrentMonth ? metrics.lowRatings.length : 0}
          />
        </>
      )}
    </div>
  )
}

function deltaText(pct: number | null, previous: number) {
  if (pct === null) return previous === 0 ? 'Sem entregas no mês anterior' : ''
  if (Math.round(pct) === 0) return 'Igual ao mês anterior'
  return `${pct > 0 ? '+' : ''}${Math.round(pct)}% vs. mês anterior`
}

/* ---------------------------------------------------------------- partes */

function MonthPicker({
  value,
  current,
  onChange,
}: {
  value: MonthKey
  current: MonthKey
  onChange: (m: MonthKey) => void
}) {
  const options = Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i))
  return (
    <label className="relative inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground sm:self-auto">
      <CalendarDays className="size-4 text-muted-foreground" />
      <span className="sr-only">Mês do dashboard</span>
      <select
        value={`${value.year}-${value.month}`}
        onChange={(e) => {
          const [y, m] = e.target.value.split('-').map(Number)
          onChange({ year: y, month: m })
        }}
        className="cursor-pointer appearance-none bg-transparent pr-6 outline-none"
      >
        {options.map((o) => (
          <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`} className="bg-card">
            {MONTHS_LONG[o.month]} {o.year}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />
    </label>
  )
}

const TONE_CLASSES = {
  primary: 'bg-primary/15 text-primary',
  neutral: 'bg-secondary text-muted-foreground',
  warning: 'bg-amber-500/15 text-amber-500',
} as const

function KpiCard({
  loading,
  icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  loading: boolean
  icon: React.ReactNode
  tone: keyof typeof TONE_CLASSES
  label: string
  value: number
  hint: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5"
    >
      <span className={cn('hidden size-12 shrink-0 place-items-center rounded-xl sm:grid', TONE_CLASSES[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-9 w-14" />
        ) : (
          <p className="font-display text-4xl leading-tight tracking-wide tabular-nums">{pad2(value)}</p>
        )}
        <p className="line-clamp-2 text-xs text-muted-foreground sm:truncate">{loading ? ' ' : hint}</p>
      </div>
    </Link>
  )
}

function CardHeader({
  icon,
  title,
  subtitle,
  action,
  aside,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  action?: { href: string; label: string }
  aside?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action && (
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {action.label}
          <ArrowUpRight className="size-4" />
        </Link>
      )}
      {aside}
    </div>
  )
}

function DeltaBadge({ pct }: { pct: number }) {
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-sm font-medium', up ? 'text-primary' : 'text-destructive')}>
      <Icon className="size-4" />
      {formatDecimal(Math.abs(pct))}%
    </span>
  )
}

function DeliveriesChart({
  data,
  selected,
  current,
  onSelect,
}: {
  data: { key: MonthKey; count: number }[]
  selected: MonthKey
  current: MonthKey
  onSelect: (m: MonthKey) => void
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="mt-6">
      <div className="flex h-44 items-end gap-1.5 sm:gap-3">
        {data.map((d) => {
          const isSelected = sameMonth(d.key, selected)
          const isFuture = monthStart(d.key) > monthStart(current)
          const label = `${MONTHS_LONG[d.key.month]} ${d.key.year}: ${plural(d.count, 'entrega', 'entregas')}`
          return (
            <button
              key={`${d.key.year}-${d.key.month}`}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={isSelected}
              disabled={isFuture}
              onClick={() => onSelect(d.key)}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1 disabled:cursor-default"
            >
              <span
                className={cn(
                  'text-[11px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100',
                  isSelected ? 'font-semibold text-foreground opacity-100' : 'text-muted-foreground',
                )}
              >
                {d.count}
              </span>
              <span
                className={cn(
                  'w-full max-w-10 rounded-t-md transition-colors',
                  isSelected ? 'bg-primary' : 'bg-muted-foreground/25 group-hover:bg-muted-foreground/45',
                )}
                style={{ height: `${Math.max(d.count > 0 ? 6 : 2, (d.count / max) * 100)}%` }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-border pt-2 sm:gap-3">
        {data.map((d) => (
          <span
            key={`${d.key.year}-${d.key.month}`}
            className={cn(
              'flex-1 text-center text-[11px]',
              sameMonth(d.key, selected) ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {MONTHS_SHORT[d.key.month][0]}
          </span>
        ))}
      </div>
    </div>
  )
}

function HealthCard({
  loading,
  score,
  capacityPct,
  avgDeliveryDays,
  riskProjects,
  overdue,
}: {
  loading: boolean
  score: number
  capacityPct: number | null
  avgDeliveryDays: number | null
  riskProjects: number
  overdue: number
}) {
  const level = score >= 80 ? 'ok' : score >= 60 ? 'warn' : 'bad'
  const badge = {
    ok: { label: 'Saudável', cls: 'bg-primary/15 text-primary', dot: 'bg-primary' },
    warn: { label: 'Atenção', cls: 'bg-amber-500/15 text-amber-500', dot: 'bg-amber-500' },
    bad: { label: 'Crítica', cls: 'bg-destructive/15 text-destructive', dot: 'bg-destructive' },
  }[level]
  const headline = {
    ok: 'Operação em bom ritmo',
    warn: 'Operação pedindo atenção',
    bad: 'Operação sobrecarregada',
  }[level]
  const detail =
    overdue > 0
      ? `${plural(overdue, 'entrega atrasada', 'entregas atrasadas')} puxando a nota pra baixo.`
      : capacityPct !== null && capacityPct > 85
        ? 'Equipe perto do limite — vale redistribuir.'
        : level === 'ok'
          ? 'Prazos em dia e equipe com folga.'
          : 'Alguns pontos merecem atenção nesta semana.'

  const radius = 42
  const circumference = 2 * Math.PI * radius
  const ringColor = level === 'ok' ? 'stroke-primary' : level === 'warn' ? 'stroke-amber-500' : 'stroke-destructive'

  return (
    <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
      <CardHeader
        icon={<Gauge className="size-5" />}
        title="Saúde operacional"
        subtitle="Indicadores da operação hoje"
        aside={
          !loading && (
            <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', badge.cls)}>
              <span className={cn('size-1.5 rounded-full', badge.dot)} />
              {badge.label}
            </span>
          )
        }
      />
      {loading ? (
        <Skeleton className="mt-6 h-52 w-full rounded-xl" />
      ) : (
        <>
          <div className="mt-5 flex items-center gap-5">
            <div
              className="relative grid size-28 shrink-0 place-items-center"
              title="Pontualidade (40%), satisfação dos clientes nos últimos 90 dias (30%) e folga da equipe (30%)"
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-secondary" />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - score / 100)}
                  className={cn('transition-[stroke-dashoffset] duration-700', ringColor)}
                />
              </svg>
              <span className="font-display text-4xl tracking-wide tabular-nums">
                {score}
                <span className="align-top text-xs text-muted-foreground">/100</span>
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{headline}</p>
              <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
          <dl className="mt-5 flex flex-col gap-3 border-t border-border pt-4 text-sm">
            <HealthRow
              dot={capacityPct !== null && capacityPct > 85 ? 'bg-amber-500' : 'bg-primary'}
              label="Capacidade da equipe"
              title={`Trabalhos em aberto sobre ${ITEMS_PER_PERSON} por pessoa ativa da equipe`}
              value={capacityPct === null ? '—' : `${capacityPct}%`}
            />
            <HealthRow
              dot="bg-amber-500"
              label="Prazo médio de entrega"
              title="Do envio do vídeo até a aprovação do cliente, no mês escolhido"
              value={avgDeliveryDays === null ? '—' : `${formatDecimal(avgDeliveryDays)} ${avgDeliveryDays < 1.05 && avgDeliveryDays >= 0.95 ? 'dia' : 'dias'}`}
            />
            <HealthRow
              dot={riskProjects > 0 ? 'bg-destructive' : 'bg-primary'}
              label="Projetos em risco"
              title="Projetos com vídeo atrasado ou vencendo em até 2 dias"
              value={pad2(riskProjects)}
            />
          </dl>
        </>
      )}
    </section>
  )
}

function HealthRow({ dot, label, value, title }: { dot: string; label: string; value: string; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3" title={title}>
      <dt className="flex items-center gap-2.5 text-muted-foreground">
        <span className={cn('size-2 rounded-full', dot)} />
        {label}
      </dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function RecordingRow({ event }: { event: CalendarActivity }) {
  const start = new Date(event.startAt)
  const time = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const where = event.clientName || CALENDAR_ACTIVITY_TYPE_LABEL[event.type]
  const lead = event.crew[0]?.name
  return (
    <li className="border-t border-border">
      <Link href="/calendario" className="flex items-center gap-4 py-3 transition-colors hover:bg-secondary/40 sm:-mx-2 sm:rounded-lg sm:px-2">
        <span className="grid w-12 shrink-0 place-items-center rounded-lg bg-secondary py-1.5 text-center">
          <span className="font-display text-2xl leading-none">{pad2(start.getDate())}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{MONTHS_SHORT[start.getMonth()]}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{event.title}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {where} · {time}
          </span>
        </span>
        {lead && (
          <span
            title={event.crew.map((c) => c.name).join(', ')}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
          >
            {initials(lead)}
          </span>
        )}
      </Link>
    </li>
  )
}

function FeedbackCard({
  loading,
  avg,
  count,
  satisfiedPct,
  testimonial,
  clientSince,
  isCurrentMonth,
  monthLabel,
}: {
  loading: boolean
  avg: number | null
  count: number
  satisfiedPct: number | null
  testimonial: RatingsReport['ratings'][number] | null
  clientSince: string | null
  isCurrentMonth: boolean
  monthLabel: string
}) {
  const since = clientSince ? monthsSince(clientSince) : null
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-card p-5">
      <CardHeader
        icon={<MessageSquareQuote className="size-5" />}
        title="Feedback dos clientes"
        subtitle={isCurrentMonth ? 'Sobre as entregas deste mês' : `Sobre as entregas de ${monthLabel.toLowerCase()}`}
        aside={
          !loading &&
          avg !== null && (
            <span className="inline-flex shrink-0 items-center gap-1 font-display text-3xl tracking-wide text-amber-400">
              {formatDecimal(avg)}
              <Star className="size-5 fill-current" />
            </span>
          )
        }
      />
      {loading ? (
        <Skeleton className="mt-4 h-28 w-full rounded-xl" />
      ) : (
        <>
          <div className="mt-4 flex-1">
            {testimonial ? (
              <figure className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                  {initials(testimonial.clientName || testimonial.projectName || '?')}
                </span>
                <div className="min-w-0">
                  <blockquote className="text-foreground">“{testimonial.comment}”</blockquote>
                  <figcaption className="mt-1.5 text-xs text-muted-foreground">
                    — {testimonial.clientName || testimonial.projectName}
                    {since !== null && since > 0 && ` · Cliente há ${plural(since, 'mês', 'meses')}`}
                    {testimonial.videoTitle && ` · ${testimonial.videoTitle}`}
                  </figcaption>
                </div>
              </figure>
            ) : (
              <p className="text-sm text-muted-foreground">
                {count > 0
                  ? 'Nenhum cliente deixou recado escrito neste mês — só as estrelas.'
                  : 'Nenhuma avaliação recebida neste mês ainda.'}{' '}
                O recado aparece aqui quando o cliente escreve algo ao aprovar.
              </p>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
            <Link href="/relatorios?aba=avaliacoes" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <CheckCircle2 className="size-4" />
              {plural(count, 'avaliação recebida', 'avaliações recebidas')}
            </Link>
            {satisfiedPct !== null && (
              <span className="font-medium text-primary" title="Notas gerais 4 ou 5">
                {satisfiedPct}% deram 4 ou 5 estrelas
              </span>
            )}
          </div>
        </>
      )}
    </section>
  )
}

type Attention = {
  key: string
  /** Muda quando o problema muda — um aviso dispensado volta se piorar. */
  signature: string
  icon: React.ReactNode
  tone: 'warning' | 'neutral'
  title: string
  description: string
  cta: string
  href: string
}

function AttentionCard({
  loading,
  overdue,
  waitingClient,
  inAdjust,
  dueSoon,
  capacityPct,
  lowRatings,
}: {
  loading: boolean
  overdue: { id: string; title: string }[]
  waitingClient: Video[]
  inAdjust: Video[]
  dueSoon: { id: string; title: string }[]
  capacityPct: number | null
  lowRatings: number
}) {
  const [dismissed, setDismissed] = useState<Record<string, string>>({})
  useEffect(() => setDismissed(readDismissed()), [])

  const items: Attention[] = []
  if (overdue.length > 0) {
    items.push({
      key: 'atrasadas',
      signature: overdue.map((o) => o.id).sort().join(','),
      icon: <AlertTriangle className="size-5" />,
      tone: 'warning',
      title: plural(overdue.length, 'entrega atrasada', 'entregas atrasadas'),
      description: joinNames(overdue.map((o) => o.title)),
      cta: 'Requer ação',
      href: '/kanban',
    })
  }
  if (dueSoon.length > 0) {
    items.push({
      key: 'vencendo',
      signature: dueSoon.map((o) => o.id).sort().join(','),
      icon: <TimerReset className="size-5" />,
      tone: 'warning',
      title: `${plural(dueSoon.length, 'prazo vence', 'prazos vencem')} nas próximas 48h`,
      description: joinNames(dueSoon.map((o) => o.title)),
      cta: 'Ver prazos',
      href: '/kanban',
    })
  }
  if (capacityPct !== null && capacityPct >= 85) {
    items.push({
      key: 'capacidade',
      signature: String(Math.floor(capacityPct / 10)),
      icon: <Users className="size-5" />,
      tone: 'neutral',
      title: `Equipe com ${capacityPct}% de ocupação`,
      description: 'Considere redistribuir as demandas da próxima semana',
      cta: 'Acompanhar',
      href: '/kanban',
    })
  }
  if (waitingClient.length > 0) {
    items.push({
      key: 'aguardando',
      signature: waitingClient.map((v) => v.id).sort().join(','),
      icon: <Hourglass className="size-5" />,
      tone: 'neutral',
      title: `${plural(waitingClient.length, 'vídeo aguardando', 'vídeos aguardando')} o cliente há mais de 3 dias`,
      description: joinNames(waitingClient.map((v) => v.title)),
      cta: 'Cobrar cliente',
      href: waitingClient.length === 1 ? `/videos/${waitingClient[0].id}/canal-cliente` : '/videos',
    })
  }
  if (inAdjust.length > 0) {
    items.push({
      key: 'ajustes',
      signature: inAdjust.map((v) => v.id).sort().join(','),
      icon: <VideoIcon className="size-5" />,
      tone: 'neutral',
      title: `${plural(inAdjust.length, 'vídeo com ajuste pedido', 'vídeos com ajuste pedido')} pelo cliente`,
      description: joinNames(inAdjust.map((v) => v.title)),
      cta: 'Ver ajustes',
      href: inAdjust.length === 1 ? `/videos/${inAdjust[0].id}/revisao` : '/videos',
    })
  }
  if (lowRatings > 0) {
    items.push({
      key: 'notas-baixas',
      signature: String(lowRatings),
      icon: <Star className="size-5" />,
      tone: 'warning',
      title: `${plural(lowRatings, 'nota baixa', 'notas baixas')} de cliente neste mês`,
      description: 'Entregas avaliadas com 1 ou 2 estrelas',
      cta: 'Ver avaliações',
      href: '/relatorios?aba=avaliacoes',
    })
  }

  const visible = items.filter((i) => dismissed[i.key] !== i.signature)
  const hiddenCount = items.length - visible.length

  function dismiss(item: Attention) {
    const next = { ...dismissed, [item.key]: item.signature }
    setDismissed(next)
    writeDismissed(next)
  }
  function restore() {
    setDismissed({})
    writeDismissed({})
  }

  return (
    <section className="mt-3 rounded-2xl border border-border bg-card p-5">
      <CardHeader
        icon={<AlertTriangle className="size-5" />}
        title="Pontos de atenção"
        subtitle="Pendências que podem impactar as próximas entregas"
        action={{ href: '/notificacoes', label: 'Ver todas' }}
      />
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary" />
            Nada pedindo atenção agora.
            {hiddenCount > 0 && (
              <button type="button" onClick={restore} className="font-medium text-foreground underline-offset-2 hover:underline">
                Mostrar {plural(hiddenCount, 'aviso dispensado', 'avisos dispensados')}
              </button>
            )}
          </p>
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.key} className="flex items-center gap-3 border-t border-border py-3 sm:gap-4">
                <span
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-xl',
                    item.tone === 'warning' ? 'bg-amber-500/15 text-amber-500' : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {item.icon}
                </span>
                <Link href={item.href} className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{item.description}</p>
                </Link>
                <Link
                  href={item.href}
                  className={cn(
                    'hidden min-h-9 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-opacity hover:opacity-80 sm:inline-flex',
                    item.tone === 'warning' ? 'bg-amber-500/15 text-amber-500' : 'bg-secondary text-foreground',
                  )}
                >
                  {item.cta}
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(item)}
                  aria-label={`Dispensar: ${item.title}`}
                  title="Dispensar (volta se a situação mudar)"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
