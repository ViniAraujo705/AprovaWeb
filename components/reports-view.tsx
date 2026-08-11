'use client'

/**
 * Relatórios de produtividade (/relatorios) — owner-only. Cruza vídeo ×
 * prazo × cliente × responsável × calendário, tudo computado no frontend a
 * partir de dados que já existem (`videoService`, `clientService`,
 * `teamService`, `calendarService`) — sem endpoint novo.
 *
 * Limitação conhecida: `Video` não tem timestamp de aprovação/entrega
 * (`approvedAt`/`deliveredAt`), só `createdAt` e `deadline`. Por isso o
 * comparativo mensal usa "criados por mês" (volume de entrada) em vez de
 * "aprovados/entregues por mês" — sem esse campo no backend não dá pra saber
 * em que mês um vídeo específico foi de fato entregue. Pelo mesmo motivo, o
 * comparativo "vs período anterior" só existe pro card "Produzidos" — é o
 * único que compara uma janela de tempo fechada (createdAt), não um estado
 * atual (atrasados/em aberto não têm como ser reconstruídos no passado sem
 * um histórico versionado no backend).
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  FileBarChart,
  Film,
  Clock,
  AlertTriangle,
  Flame,
  Contact,
  UserCog,
  CalendarClock,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Download,
  Printer,
} from 'lucide-react'
import { calendarService, clientService, teamService, videoService } from '@/lib/services'
import { productionStageLabel, type Client, type ProductionStage, type RecordingEvent, type TeamMember, type Video } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { StaggerList, staggerItem, motion, AnimatePresence } from '@/components/motion'
import { cn } from '@/lib/utils'

type Period = '30' | '90' | '180' | 'all'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 3 meses' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: 'all', label: 'Todo o período' },
]

/** Vídeo ainda em fluxo interno — nem aprovado, nem entregue. Mesma regra usada na "Carga da equipe" do dashboard. */
function isActive(v: Video): boolean {
  return v.status !== 'aprovado' && v.productionStage !== 'entregue'
}

function isOverdue(v: Video): boolean {
  return isActive(v) && !!v.deadline && new Date(v.deadline).getTime() < Date.now()
}

function periodStart(period: Period): number | null {
  if (period === 'all') return null
  const days = Number(period)
  return Date.now() - days * 24 * 60 * 60 * 1000
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '')
}

/** Últimos 6 meses (incluindo o atual), mais antigo primeiro. */
function last6Months(): string[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return monthKey(d.toISOString())
  })
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(';')).join('\r\n')
}

/** BOM no início pro Excel (pt-BR, separador `;`) reconhecer UTF-8 e acentuação sem virar caractere corrompido. */
function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ReportsView() {
  const [period, setPeriod] = useState<Period>('90')
  const [overdueListOpen, setOverdueListOpen] = useState(false)

  const videosQuery = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const clientsQuery = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const membersQuery = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const eventsQuery = useQuery<RecordingEvent[]>((signal) => calendarService.list(signal), [])

  const loading = videosQuery.loading || clientsQuery.loading || membersQuery.loading || eventsQuery.loading
  const error = videosQuery.error || clientsQuery.error || membersQuery.error || eventsQuery.error

  // Só as versões mais recentes de cada vídeo contam — mesmo critério do dashboard.
  const videos = useMemo(
    () => (videosQuery.data ?? []).filter((v) => v.latestVersionId === v.id),
    [videosQuery.data],
  )
  const members = (membersQuery.data ?? []).filter((m) => m.name)
  const events = eventsQuery.data ?? []

  const start = periodStart(period)
  const inPeriod = useMemo(
    () => videos.filter((v) => !start || (v.createdAt && new Date(v.createdAt).getTime() >= start)),
    [videos, start],
  )
  const eventsInPeriod = useMemo(
    () => events.filter((ev) => !start || new Date(ev.startAt).getTime() >= start),
    [events, start],
  )

  // Delta vs. a janela imediatamente anterior, do mesmo tamanho — só faz
  // sentido pra métrica com timestamp de entrada (`createdAt`); "todo o
  // período" não tem uma "janela anterior" bem definida.
  const previousPeriodCount = useMemo(() => {
    if (period === 'all' || start === null) return null
    const days = Number(period)
    const prevStart = start - days * 24 * 60 * 60 * 1000
    return videos.filter((v) => {
      if (!v.createdAt) return false
      const t = new Date(v.createdAt).getTime()
      return t >= prevStart && t < start
    }).length
  }, [videos, period, start])

  const delivered = videos.filter((v) => v.productionStage === 'entregue')
  const activeVideos = videos.filter(isActive)
  const overdueVideos = videos.filter(isOverdue)

  // Gargalo por etapa: entre as etapas "em fluxo" (exclui aprovado/entregue), qual acumula mais vídeos.
  const stageBottleneck = useMemo(() => {
    const flowStages: ProductionStage[] = ['planejado', 'producao', 'edicao', 'aguardando_aprovacao', 'ajustes']
    const counts = flowStages.map((stage) => ({
      stage,
      count: videos.filter((v) => v.productionStage === stage).length,
    }))
    counts.sort((a, b) => b.count - a.count)
    return counts[0]?.count > 0 ? counts[0] : null
  }, [videos])

  // Prioridade: quem tem atraso sobe primeiro, depois quem tem mais vídeo
  // ativo — cliente parado (0 ativos, 0 atrasados) cai pro fim da lista.
  const clientVolume = useMemo(() => {
    const byName = new Map<string, { active: number; delivered: number; total: number; overdue: number }>()
    for (const v of videos) {
      const key = v.clientName || 'Sem cliente'
      const entry = byName.get(key) ?? { active: 0, delivered: 0, total: 0, overdue: 0 }
      entry.total++
      if (isActive(v)) entry.active++
      if (isOverdue(v)) entry.overdue++
      if (v.productionStage === 'entregue') entry.delivered++
      byName.set(key, entry)
    }
    return Array.from(byName.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.overdue - a.overdue || b.active - a.active || b.total - a.total)
  }, [videos])

  const monthly = useMemo(() => {
    const months = last6Months()
    const counts = new Map(months.map((m) => [m, 0]))
    for (const v of videos) {
      if (!v.createdAt) continue
      const key = monthKey(v.createdAt)
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return months.map((key) => ({ key, label: monthLabel(key), count: counts.get(key) ?? 0 }))
  }, [videos])

  // Mesma prioridade da lista de clientes: atrasado sobe primeiro, depois
  // quem produz mais; sem nenhuma atividade (nem ativo, nem entregue, nem
  // atrasado) cai pro fim — mas continua na lista, só mais apagado, porque
  // "ninguém com nada na mão" também é um sinal de gestão.
  const teamRows = useMemo(() => {
    return members
      .map((m) => {
        const assigned = videos.filter((v) => v.editorId === m.id)
        return {
          member: m,
          deliveredCount: assigned.filter((v) => v.productionStage === 'entregue').length,
          activeCount: assigned.filter(isActive).length,
          overdueCount: assigned.filter(isOverdue).length,
          recordingsInPeriod: eventsInPeriod.filter((ev) => ev.crew.some((c) => c.userId === m.id)).length,
        }
      })
      .sort(
        (a, b) =>
          b.overdueCount - a.overdueCount ||
          b.deliveredCount + b.activeCount - (a.deliveredCount + a.activeCount),
      )
  }, [members, videos, eventsInPeriod])

  function exportCsv() {
    const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? ''
    const rows: string[][] = [
      ['Relatório de produtividade — Aprova', periodLabel],
      [],
      ['Métrica', 'Valor'],
      ['Produzidos no período', String(inPeriod.length)],
      ['Entregues (total)', String(delivered.length)],
      ['Atrasados agora', String(overdueVideos.length)],
      ['Em aberto', String(activeVideos.length)],
      [],
      ['Volume mensal (últimos 6 meses)'],
      ['Mês', 'Vídeos criados'],
      ...monthly.map((m) => [m.label, String(m.count)]),
      [],
      ['Volume por cliente'],
      ['Cliente', 'Total', 'Ativos', 'Entregues', 'Atrasados'],
      ...clientVolume.map((c) => [c.name, String(c.total), String(c.active), String(c.delivered), String(c.overdue)]),
      [],
      ['Produtividade por profissional'],
      ['Profissional', 'Entregues', 'Ativos', 'Atrasados', 'Gravações no período'],
      ...teamRows.map((r) => [
        r.member.name,
        String(r.deliveredCount),
        String(r.activeCount),
        String(r.overdueCount),
        String(r.recordingsInPeriod),
      ]),
    ]
    downloadCsv(buildCsv(rows), `relatorio-aprova-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // PDF via impressão do navegador (Salvar como PDF) — sem depender de
  // biblioteca nenhuma. `print:hidden` no sidebar/header (ver
  // `agency-shell.tsx`) garante que só o conteúdo do relatório sai impresso.
  function exportPdf() {
    window.print()
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">RELATÓRIOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Produtividade, prazos e volume de trabalho da operação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
          >
            <Printer className="size-4" /> PDF
          </button>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState message={error} onRetry={() => { videosQuery.refetch(); clientsQuery.refetch(); membersQuery.refetch(); eventsQuery.refetch() }} />
        </div>
      ) : videos.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<FileBarChart className="size-7" />}
            title="Nada pra medir ainda"
            description="Assim que houver vídeos em produção, os relatórios aparecem aqui."
          />
        </div>
      ) : (
        <>
          <StaggerList className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              icon={<Film className="size-4" />}
              label="Produzidos no período"
              value={inPeriod.length}
              comparison={previousPeriodCount === null ? null : { delta: inPeriod.length - previousPeriodCount }}
            />
            <Kpi icon={<CalendarClock className="size-4" />} label="Entregues (total)" value={delivered.length} />
            <OverdueKpi
              count={overdueVideos.length}
              expanded={overdueListOpen}
              onToggle={() => setOverdueListOpen((v) => !v)}
            />
            <Kpi icon={<Clock className="size-4" />} label="Em aberto" value={activeVideos.length} hint="não aprovados nem entregues" />
          </StaggerList>

          <AnimatePresence initial={false}>
            {overdueListOpen && overdueVideos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-2">
                  <ul className="flex flex-col">
                    {overdueVideos.map((v) => (
                      <li key={v.id}>
                        <Link
                          href={`/videos/${v.id}/revisao`}
                          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-destructive/10"
                        >
                          <span className="min-w-0 truncate font-medium text-foreground">{v.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{v.clientName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Comparativo mensal */}
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <FileBarChart className="size-4 text-muted-foreground" /> Volume mensal
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Vídeos criados por mês, últimos 6 meses — indicador de volume, não de aprovação.
            </p>
            <div className="mt-4 flex items-end gap-3 sm:gap-5">
              {(() => {
                const max = Math.max(1, ...monthly.map((m) => m.count))
                return monthly.map((m) => {
                  const hasData = m.count > 0
                  return (
                    <div
                      key={m.key}
                      className={cn('flex flex-1 flex-col items-center gap-1.5', !hasData && 'opacity-30')}
                      title={`${m.label}: ${m.count}`}
                    >
                      <span className={cn('text-xs', hasData ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                        {m.count}
                      </span>
                      <div className="flex h-24 w-full items-end overflow-hidden rounded-md bg-secondary">
                        {hasData && (
                          <div
                            className="w-full rounded-t-md bg-primary transition-all"
                            style={{ height: `${(m.count / max) * 100}%` }}
                          />
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-[11px] capitalize',
                          hasData ? 'font-medium text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {m.label}
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>

          {/* Gargalos */}
          {(stageBottleneck || overdueVideos.length > 0) && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {stageBottleneck && (
                <BottleneckCard
                  icon={<Flame className="size-4" />}
                  title="Maior fila"
                  description={`"${productionStageLabel[stageBottleneck.stage]}" concentra ${stageBottleneck.count} vídeo${stageBottleneck.count === 1 ? '' : 's'} — a etapa com mais gente parada.`}
                />
              )}
              {overdueVideos.length > 0 && (
                <BottleneckCard
                  icon={<AlertTriangle className="size-4" />}
                  title="Prazos vencidos"
                  tone="destructive"
                  description={`${overdueVideos.length} vídeo${overdueVideos.length === 1 ? '' : 's'} ativo${overdueVideos.length === 1 ? '' : 's'} com prazo já vencido.`}
                />
              )}
            </div>
          )}

          {/* Volume por cliente */}
          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Contact className="size-4 text-muted-foreground" /> Volume por cliente
            </h2>
            <div className="mt-3 flex flex-col gap-1.5">
              {clientVolume.map((c) => {
                const overdue = c.overdue > 0
                const idle = c.active === 0 && !overdue
                return (
                  <div
                    key={c.name}
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2',
                      overdue ? 'bg-destructive/10' : 'bg-secondary/50',
                      idle && 'opacity-50',
                    )}
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">{c.name}</span>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span>{c.total} total</span>
                      <span>{c.active} ativo{c.active === 1 ? '' : 's'}</span>
                      <span>{c.delivered} entregue{c.delivered === 1 ? '' : 's'}</span>
                      {overdue && (
                        <span className="inline-flex items-center gap-1 font-medium text-destructive">
                          <AlertTriangle className="size-3" /> {c.overdue} atrasado{c.overdue === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Produtividade por profissional */}
          {teamRows.length > 0 && (
            <div className="mt-6 rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <UserCog className="size-4 text-muted-foreground" /> Produtividade por profissional
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Entregues e ativos são totais gerais; gravações seguem o período selecionado acima.
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {teamRows.map(({ member, deliveredCount, activeCount, overdueCount, recordingsInPeriod }) => {
                  const overdue = overdueCount > 0
                  const idle = activeCount === 0 && deliveredCount === 0 && !overdue
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2',
                        overdue ? 'bg-destructive/10' : 'bg-secondary/50',
                        idle && 'opacity-50',
                      )}
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{member.name}</span>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <span>{deliveredCount} entregue{deliveredCount === 1 ? '' : 's'}</span>
                        <span>{activeCount} ativo{activeCount === 1 ? '' : 's'}</span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 font-medium text-destructive">
                            <AlertTriangle className="size-3" /> {overdueCount} atrasado{overdueCount === 1 ? '' : 's'}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3" /> {recordingsInPeriod}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  comparison,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint?: string
  /** `null` = sem comparação disponível (ex: período "todo o período"); omitido = card sem comparação. */
  comparison?: { delta: number } | null
}) {
  return (
    <motion.div variants={staggerItem} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-display text-3xl leading-none tracking-wide text-foreground sm:text-4xl">{value}</p>
      {comparison ? (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            comparison.delta > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : comparison.delta < 0
                ? 'text-muted-foreground'
                : 'text-muted-foreground',
          )}
        >
          {comparison.delta > 0 && <ArrowUp className="size-3" />}
          {comparison.delta < 0 && <ArrowDown className="size-3" />}
          {comparison.delta === 0
            ? 'Igual ao período anterior'
            : `${comparison.delta > 0 ? '+' : ''}${comparison.delta} vs período anterior`}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      )}
    </motion.div>
  )
}

/**
 * Card "Atrasados agora" — o dado mais crítico da tela, por isso foge do
 * padrão neutro dos outros KPIs: fundo/borda vermelhos sutis sempre que há
 * algo atrasado, e vira um botão que expande a lista de vídeos (ver render
 * principal) em vez de só mostrar o número.
 */
function OverdueKpi({
  count,
  expanded,
  onToggle,
}: {
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  const hasOverdue = count > 0
  return (
    <motion.button
      type="button"
      variants={staggerItem}
      onClick={hasOverdue ? onToggle : undefined}
      aria-expanded={hasOverdue ? expanded : undefined}
      className={cn(
        'rounded-xl border p-4 text-left transition-colors',
        hasOverdue
          ? 'cursor-pointer border-destructive/30 bg-destructive/10 hover:bg-destructive/15'
          : 'cursor-default border-border bg-card',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          hasOverdue ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        <AlertTriangle className="size-4" />
        Atrasados agora
      </div>
      <p
        className={cn(
          'mt-2 font-display text-3xl leading-none tracking-wide sm:text-4xl',
          hasOverdue ? 'text-destructive' : 'text-foreground',
        )}
      >
        {count}
      </p>
      {hasOverdue ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-destructive underline underline-offset-2">
          {expanded ? 'Ocultar lista' : 'Ver lista'} <ArrowRight className="size-3" />
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">Tudo em dia</p>
      )}
    </motion.button>
  )
}

function BottleneckCard({
  icon,
  title,
  description,
  tone,
}: {
  icon: React.ReactNode
  title: string
  description: string
  tone?: 'destructive'
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border p-4',
        tone === 'destructive' ? 'border-destructive/30 bg-destructive/5' : 'border-amber-500/30 bg-amber-500/5',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          tone === 'destructive' ? 'bg-destructive/15 text-destructive' : 'bg-amber-500/15 text-amber-500',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
