'use client'

/**
 * Desempenho da equipe (/equipe/desempenho) — owner-only. Filtro de período
 * (pela data de aprovação), resumo da equipe, pontos de atenção de agora
 * (atrasados / em ajuste) e um card por pessoa com nota média (0-10) e
 * tendência, aprovados, versões até aprovar, entregas no prazo e trabalho em
 * aberto. Cada card abre a lista dos vídeos que formaram a média.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  Lock,
  Minus,
  UserPlus,
} from 'lucide-react'
import { teamPerformanceService } from '@/lib/services'
import type { EditorPerformance, PerformanceTier } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import { motion, useReducedMotion } from '@/components/motion'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { Gesture } from '@/components/gestures'
import { PageHeader } from '@/components/page-header'
import { ClientAvatar } from '@/components/client-avatar'

const tierFillClass: Record<Exclude<PerformanceTier, 'sem_dados'>, string> = {
  verde: 'bg-primary',
  amarelo: 'bg-warning',
  laranja: 'bg-orange-400',
  vermelho: 'bg-danger',
}

const tierTextClass: Record<Exclude<PerformanceTier, 'sem_dados'>, string> = {
  verde: 'text-primary-foreground',
  amarelo: 'text-warning-foreground',
  laranja: 'text-warning-foreground',
  vermelho: 'text-danger-foreground',
}

/* --------------------------------- período -------------------------------- */

type PeriodKey = '30d' | 'mes' | 'mes_passado' | 'tudo'

const PERIODS: { key: PeriodKey; label: string; phrase: string }[] = [
  { key: '30d', label: '30 dias', phrase: 'nos últimos 30 dias' },
  { key: 'mes', label: 'Este mês', phrase: 'neste mês' },
  { key: 'mes_passado', label: 'Mês passado', phrase: 'no mês passado' },
  { key: 'tudo', label: 'Tudo', phrase: 'desde o início' },
]

function periodRange(key: PeriodKey): { from: string | null; to: string | null } {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  switch (key) {
    case '30d':
      return { from: new Date(now.getTime() - 30 * 24 * 3600_000).toISOString(), to: null }
    case 'mes':
      return { from: startOfMonth.toISOString(), to: null }
    case 'mes_passado':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
        to: startOfMonth.toISOString(),
      }
    case 'tudo':
      return { from: null, to: null }
  }
}

/* --------------------------------- ordenação ------------------------------ */

type SortMode = 'score' | 'count' | 'onTime' | 'open'

const SORTS: { key: SortMode; label: string }[] = [
  { key: 'score', label: 'Nota média' },
  { key: 'count', label: 'Aprovados' },
  { key: 'onTime', label: 'No prazo' },
  { key: 'open', label: 'Em aberto' },
]

function onTimeRate(r: EditorPerformance): number | null {
  return r.approvedWithDeadline > 0 ? r.approvedOnTime / r.approvedWithDeadline : null
}

/** null sempre vai para o final. */
function byNullableDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

function sortRows(rows: EditorPerformance[], mode: SortMode): EditorPerformance[] {
  return [...rows].sort((a, b) => {
    switch (mode) {
      case 'count':
        return b.approvedVideosCount - a.approvedVideosCount
      case 'onTime':
        return byNullableDesc(onTimeRate(a), onTimeRate(b))
      case 'open':
        return b.overdue - a.overdue || b.inProgress - a.inProgress
      default:
        return byNullableDesc(a.averageScore, b.averageScore)
    }
  })
}

/* --------------------------------- helpers -------------------------------- */

const fmt = (n: number) => n.toFixed(1).replace('.', ',')
const pct = (part: number, total: number) => `${Math.round((part / total) * 100)}%`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function average(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null
}

/**
 * Totais da equipe sem contar duas vezes o vídeo que tem mais de um
 * responsável. Usa a lista de vídeos de cada pessoa (o backend manda até 50);
 * se alguém passou disso, cai na soma simples.
 */
function teamTotals(rows: EditorPerformance[]) {
  const capped = rows.some((r) => r.videos.length < r.approvedVideosCount)
  if (capped) {
    return {
      approved: rows.reduce((s, r) => s + r.approvedVideosCount, 0),
      firstTry: rows.reduce((s, r) => s + r.approvedFirstTry, 0),
      withDeadline: rows.reduce((s, r) => s + r.approvedWithDeadline, 0),
      onTime: rows.reduce((s, r) => s + r.approvedOnTime, 0),
    }
  }
  const unique = new Map(rows.flatMap((r) => r.videos).map((v) => [v.videoId, v]))
  const list = [...unique.values()]
  return {
    approved: list.length,
    firstTry: list.filter((v) => v.versions === 1).length,
    withDeadline: list.filter((v) => v.onTime !== null).length,
    onTime: list.filter((v) => v.onTime === true).length,
  }
}

/* ---------------------------------- view ---------------------------------- */

export function TeamPerformanceView() {
  const { planStatus, openUpgradeModal } = usePlanLimit()
  // Enquanto o plano ainda não carregou, não bloqueia (o 403 real continua
  // sendo o backstop) — evita prender a UI atrás de um estado de loading.
  const locked = planStatus ? !planStatus.limits.teamPerformance : false
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [sortMode, setSortMode] = useState<SortMode>('score')
  const { data, loading, error, refetch } = useQuery<EditorPerformance[]>(
    (signal) => teamPerformanceService.list(signal, periodRange(period)),
    [period],
    { enabled: !locked },
  )

  const rows = useMemo(() => sortRows(data ?? [], sortMode), [data, sortMode])
  const phrase = PERIODS.find((p) => p.key === period)!.phrase
  const nobodyAssigned =
    rows.length > 0 && rows.every((r) => r.approvedVideosCount === 0 && r.inProgress === 0)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Equipe e resultados"
        title="Desempenho da equipe"
        description="Nota que o cliente deu, versões até aprovar, prazos e o que está em aberto, por pessoa."
        actions={
          !locked && (
            <Segmented
              ariaLabel="Período"
              value={period}
              onChange={setPeriod}
              options={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
            />
          )
        }
      />

      <div className="mt-8">
        {locked ? (
          <LockedState onUpgrade={() => openUpgradeModal('Painel de desempenho da equipe é exclusivo do plano Agência.')} />
        ) : loading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-36 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-7" />}
            title="Ninguém na equipe ainda"
            description="Convide editores e defina quem é responsável por cada vídeo para acompanhar o desempenho aqui."
            action={
              <Link
                href="/configuracoes/equipe"
                className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <UserPlus className="size-4" />
                Convidar editor
              </Link>
            }
          />
        ) : (
          <div className={cn('transition-opacity', loading && 'opacity-60')}>
            <SummaryBanner rows={rows} phrase={phrase} showTrend={period !== 'tudo'} />

            {nobodyAssigned ? (
              <p className="mt-4 rounded-2xl border border-dashed border-border bg-card px-5 py-4 text-sm text-muted-foreground">
                Nenhum vídeo tem responsável definido. Escolha o responsável ao enviar o vídeo ou na página do
                projeto, e a nota do cliente passa a contar para a pessoa certa.
              </p>
            ) : (
              <AttentionStrip rows={rows} />
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg text-foreground">
                {plural(rows.length, 'pessoa', 'pessoas')}
              </h2>
              <Segmented
                ariaLabel="Ordenar por"
                size="sm"
                value={sortMode}
                onChange={setSortMode}
                options={SORTS.map((s) => ({ value: s.key, label: s.label }))}
              />
            </div>

            <ul className="mt-3 flex flex-col gap-3">
              {rows.map((r) => (
                <PerformanceCard key={r.editorId} row={r} showTrend={period !== 'tudo'} />
              ))}
            </ul>

            <p className="mt-6 text-xs text-muted-foreground">
              A nota é a que o cliente dá ao aprovar (1 a 5 estrelas, convertida para 0 a 10). Um vídeo com mais
              de um responsável conta para cada um. &quot;No prazo&quot; considera a data em que a versão aprovada
              foi enviada; &quot;em aberto&quot; e &quot;atrasados&quot; mostram a situação de agora, sem filtro
              de período.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------- componentes ------------------------------ */

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  ariaLabel: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 text-sm"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center whitespace-nowrap rounded-lg font-medium transition-colors',
            size === 'sm' ? 'min-h-8 px-3 text-xs' : 'min-h-9 px-3.5',
            value === o.value
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function LockedState({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary-ink">
        <Lock className="size-6" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">Recurso exclusivo do plano Agência</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O painel de desempenho da equipe está disponível apenas no plano Agência.
        </p>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Ver planos
      </button>
    </div>
  )
}

function Trend({ current, previous, onDeep = false }: { current: number | null; previous: number | null; onDeep?: boolean }) {
  if (current === null || previous === null) return null
  const diff = Number((current - previous).toFixed(1))
  const muted = onDeep ? 'text-deep-muted' : 'text-muted-foreground'
  if (diff === 0) {
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-xs', muted)} title="Igual ao período anterior">
        <Minus className="size-3" /> igual
      </span>
    )
  }
  const up = diff > 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-semibold',
        up ? (onDeep ? 'text-primary' : 'text-primary-ink') : onDeep ? 'text-danger' : 'text-danger-ink',
      )}
      title={`Período anterior: ${fmt(previous)}`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {fmt(Math.abs(diff))}
    </span>
  )
}

/** Faixa verde-profunda do topo: médias da equipe no período. */
function SummaryBanner({ rows, phrase, showTrend }: { rows: EditorPerformance[]; phrase: string; showTrend: boolean }) {
  const scored = rows.filter((r) => r.averageScore !== null)
  const avg = average(scored.map((r) => r.averageScore!))
  // Tendência só entre quem tem nota nos dois períodos — comparar grupos
  // diferentes de pessoas daria uma variação que ninguém produziu.
  const both = rows.filter((r) => r.averageScore !== null && r.previousAverageScore !== null)
  const deltaAvg = average(both.map((r) => r.averageScore! - r.previousAverageScore!))
  const prevAvg = avg !== null && deltaAvg !== null ? avg - deltaAvg : null
  const totals = teamTotals(rows)
  const allMax = scored.length > 0 && scored.every((r) => (r.averageScore ?? 0) >= 9.95)
  const state = avg === null ? 'empty' : avg >= 8 ? 'check' : avg >= 6 ? 'attention' : 'critical'
  const message =
    avg === null
      ? `Nenhum vídeo aprovado com nota ${phrase}.`
      : allMax
        ? `Todo mundo com nota máxima ${phrase}.`
        : avg >= 8
          ? `A equipe deu check ${phrase}: notas altas nos vídeos aprovados.`
          : avg >= 6
            ? `Vale um check: algumas notas abaixo do esperado ${phrase}.`
            : `Hora de um check-up: notas baixas ${phrase}.`

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-deep p-6 text-deep-foreground sm:p-8 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-5">
        <Gesture state={state} onDeep className="h-20 w-auto shrink-0 sm:h-24" />
        <p className="min-w-0 text-base text-deep-muted">{message}</p>
      </div>
      <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        <BannerStat
          label="nota média"
          value={avg === null ? '—' : fmt(avg)}
          accent
          extra={showTrend ? <Trend current={avg} previous={prevAvg} onDeep /> : null}
        />
        <BannerStat label={totals.approved === 1 ? 'aprovado' : 'aprovados'} value={String(totals.approved)} />
        <BannerStat
          label="de primeira"
          value={totals.approved ? pct(totals.firstTry, totals.approved) : '—'}
        />
        <BannerStat
          label="no prazo"
          value={totals.withDeadline ? pct(totals.onTime, totals.withDeadline) : '—'}
        />
      </dl>
    </div>
  )
}

function BannerStat({
  label,
  value,
  accent = false,
  extra,
}: {
  label: string
  value: string
  accent?: boolean
  extra?: React.ReactNode
}) {
  return (
    <div className="text-center">
      <dd className={cn('font-display text-3xl leading-none sm:text-4xl', accent ? 'text-primary' : 'text-deep-foreground')}>
        {value}
      </dd>
      <dt className="mt-2 flex items-center justify-center gap-1.5 text-sm text-deep-muted">
        {label}
        {extra}
      </dt>
    </div>
  )
}

/** O que pede ação agora: vídeos atrasados e em ajuste, por pessoa. */
function AttentionStrip({ rows }: { rows: EditorPerformance[] }) {
  const overdue = rows.filter((r) => r.overdue > 0).sort((a, b) => b.overdue - a.overdue)
  const adjusting = rows.filter((r) => r.inAdjustment > 0).sort((a, b) => b.inAdjustment - a.inAdjustment)
  if (overdue.length === 0 && adjusting.length === 0) return null
  const list = (items: EditorPerformance[], n: (r: EditorPerformance) => number) =>
    items.map((r) => `${r.name.split(' ')[0] || 'Sem nome'} (${n(r)})`).join(', ')

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-warning-border bg-warning-soft px-5 py-4 text-sm sm:flex-row sm:items-start sm:gap-3">
      <AlertTriangle className="size-5 shrink-0 text-warning-ink" aria-hidden />
      <div className="space-y-1 text-foreground">
        {overdue.length > 0 && (
          <p>
            <span className="font-semibold">Prazo vencido:</span> {list(overdue, (r) => r.overdue)}
          </p>
        )}
        {adjusting.length > 0 && (
          <p>
            <span className="font-semibold">Cliente pediu ajuste:</span> {list(adjusting, (r) => r.inAdjustment)}
          </p>
        )}
      </div>
    </div>
  )
}

function PerformanceCard({ row, showTrend }: { row: EditorPerformance; showTrend: boolean }) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const hasData = row.tier !== 'sem_dados' && row.averageScore !== null
  const fill = hasData ? Math.max(0, Math.min(100, (row.averageScore! / 10) * 100)) : 0
  const name = row.name || 'Sem nome'

  return (
    <li className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-4 p-4 sm:px-6 sm:py-5">
        {/* Linha 1: pessoa + barra da nota */}
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-5">
          <ClientAvatar name={name} photoUrl={row.avatarUrl} seed={row.editorId} size="lg" />
          <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <p className="truncate text-base font-medium text-foreground" title={name}>
              {name}
            </p>
            <p className="text-xs text-muted-foreground">{row.role === 'owner' ? 'Dono da conta' : 'Editor'}</p>
          </div>

          <div className="relative order-last h-10 min-w-0 basis-full overflow-hidden rounded-full bg-secondary sm:order-none sm:basis-auto sm:flex-1">
            {hasData ? (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${fill}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'flex h-full min-w-16 items-center rounded-full px-4',
                  tierFillClass[row.tier as Exclude<PerformanceTier, 'sem_dados'>],
                )}
              >
                <span
                  className={cn(
                    'font-display text-lg leading-none whitespace-nowrap',
                    tierTextClass[row.tier as Exclude<PerformanceTier, 'sem_dados'>],
                  )}
                >
                  {fmt(row.averageScore!)}
                </span>
              </motion.div>
            ) : (
              <div className="flex h-full items-center px-4 text-sm text-muted-foreground">
                {row.approvedVideosCount > 0 ? 'Aprovados sem nota do cliente' : 'Sem aprovações no período'}
              </div>
            )}
          </div>

          <div className="flex w-16 shrink-0 justify-end">
            {showTrend && <Trend current={row.averageScore} previous={row.previousAverageScore} />}
          </div>
        </div>

        {/* Linha 2: métricas */}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Aprovados" value={String(row.approvedVideosCount)} />
          <Metric
            label="De primeira"
            value={row.approvedVideosCount ? `${row.approvedFirstTry}/${row.approvedVideosCount}` : '—'}
            hint={row.averageVersions !== null ? `média de ${fmt(row.averageVersions)} versões` : undefined}
          />
          <Metric
            label="No prazo"
            value={
              row.approvedWithDeadline ? `${row.approvedOnTime}/${row.approvedWithDeadline}` : '—'
            }
            hint={
              row.approvedWithDeadline
                ? pct(row.approvedOnTime, row.approvedWithDeadline)
                : row.approvedVideosCount
                  ? 'sem prazo definido'
                  : undefined
            }
            tone={
              row.approvedWithDeadline && row.approvedOnTime / row.approvedWithDeadline < 0.7 ? 'danger' : undefined
            }
          />
          <Metric
            label="Em aberto agora"
            value={String(row.inProgress)}
            hint={
              [
                row.overdue ? plural(row.overdue, 'atrasado', 'atrasados') : null,
                row.inAdjustment ? `${row.inAdjustment} em ajuste` : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
            tone={row.overdue ? 'danger' : undefined}
          />
        </dl>
      </div>

      {row.videos.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {open ? 'Esconder vídeos' : `Ver ${plural(row.videos.length, 'vídeo aprovado', 'vídeos aprovados')}`}
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
          {open && <VideoList row={row} />}
        </>
      )}
    </li>
  )
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'danger'
}) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-xl leading-tight text-foreground tabular-nums">{value}</span>
        {hint && <span className={cn('text-xs', tone === 'danger' ? 'font-medium text-danger-ink' : 'text-muted-foreground')}>{hint}</span>}
      </dd>
    </div>
  )
}

function VideoList({ row }: { row: EditorPerformance }) {
  return (
    <ul className="divide-y divide-border border-t border-border">
      {row.videos.map((v) => (
        <li key={v.videoId}>
          <Link
            href={`/videos/${v.videoId}/revisao`}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-secondary/50 sm:px-6"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{v.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.projectName} · aprovado em {new Date(v.approvedAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {v.versions === 1 ? 'de primeira' : `${v.versions} versões`}
            </span>
            {v.onTime !== null && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  v.onTime ? 'bg-success-soft text-success-ink' : 'bg-danger-soft text-danger-ink',
                )}
              >
                {v.onTime ? 'no prazo' : 'atrasou'}
              </span>
            )}
            <span className="w-10 text-right font-display text-base tabular-nums text-foreground">
              {v.score === null ? '—' : fmt(v.score)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
