'use client'

/**
 * Desempenho da equipe (/equipe/desempenho) — owner-only. Uma barra horizontal
 * por editor: avatar, nome, trilho 0-10 colorido pela faixa (GET
 * /team/performance) e a contagem de vídeos aprovados. A trilha usa um
 * cinza-escuro sutil para as cores de status se destacarem no fundo preto.
 */
import { useState } from 'react'
import { ArrowDownUp, BarChart3, Lock } from 'lucide-react'
import { teamPerformanceService } from '@/lib/services'
import type { EditorPerformance, PerformanceTier } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import { motion, useReducedMotion } from '@/components/motion'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { Gesture } from '@/components/gestures'
import { PageHeader } from '@/components/page-header'

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

type SortMode = 'score' | 'count'

export function TeamPerformanceView() {
  const { planStatus, openUpgradeModal } = usePlanLimit()
  // Enquanto o plano ainda não carregou, não bloqueia (o 403 real continua
  // sendo o backstop) — evita prender a UI atrás de um estado de loading.
  const locked = planStatus ? !planStatus.limits.teamPerformance : false
  const { data, loading, error, refetch } = useQuery<EditorPerformance[]>(
    (signal) => teamPerformanceService.list(signal),
    [],
    { enabled: !locked },
  )
  const [sortMode, setSortMode] = useState<SortMode>('score')

  const rows = [...(data ?? [])].sort((a, b) => {
    if (sortMode === 'count') return b.approvedVideosCount - a.approvedVideosCount
    // "sem_dados" (null) sempre vai para o final, independente da direção.
    if (a.averageScore === null) return 1
    if (b.averageScore === null) return -1
    return b.averageScore - a.averageScore
  })

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Equipe e resultados"
        title="Desempenho da equipe"
        description="Nota média dos vídeos aprovados por editor, de 0 a 10."
        actions={
        !locked && !loading && !error && (rows.length ?? 0) > 0 && (
          <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border bg-card p-1 text-sm">
            <SortButton active={sortMode === 'score'} onClick={() => setSortMode('score')}>
              Nota média
            </SortButton>
            <SortButton active={sortMode === 'count'} onClick={() => setSortMode('count')}>
              Vídeos aprovados
            </SortButton>
          </div>
        )
        }
      />

      <div className="mt-8">
        {locked ? (
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
              onClick={() =>
                openUpgradeModal('Painel de desempenho da equipe é exclusivo do plano Agência.')
              }
              className="mt-1 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Ver planos
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-7" />}
            title="Nenhum editor com dados ainda"
            description="Atribua editores aos vídeos e aprove alguns para ver o desempenho aqui."
          />
        ) : (
          <>
            <SummaryBanner rows={rows} />
            <ul className="mt-6 flex flex-col gap-3">
              {rows.map((r) => (
                <PerformanceRow key={r.editorId} row={r} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center rounded-lg px-4 font-medium transition-colors',
        active ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function PerformanceRow({ row }: { row: EditorPerformance }) {
  const reduce = useReducedMotion()
  const hasData = row.tier !== 'sem_dados' && row.averageScore !== null
  const pct = hasData ? Math.max(0, Math.min(100, (row.averageScore! / 10) * 100)) : 0

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 sm:gap-5 sm:px-6">
      {/* Avatar */}
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-avatar text-sm font-semibold text-avatar-foreground sm:size-11">
        {initials(row.name)}
      </span>

      {/* Nome */}
      <span
        className="w-24 shrink-0 truncate text-base font-medium text-foreground sm:w-44"
        title={row.name || 'Sem nome'}
      >
        {row.name || 'Sem nome'}
      </span>

      {/* Trilho + preenchimento */}
      <div className="relative h-10 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
        {hasData ? (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'flex h-full items-center rounded-full px-4',
              tierFillClass[row.tier as Exclude<PerformanceTier, 'sem_dados'>],
            )}
          >
            <span
              className={cn(
                'font-display text-lg leading-none whitespace-nowrap',
                tierTextClass[row.tier as Exclude<PerformanceTier, 'sem_dados'>],
              )}
            >
              {row.averageScore!.toFixed(1).replace('.', ',')}
            </span>
          </motion.div>
        ) : (
          <div className="flex h-full items-center px-3">
            <span className="font-display text-lg leading-none tracking-wide text-muted-foreground">
              —
            </span>
          </div>
        )}
      </div>

      {/* Contagem de vídeos aprovados */}
      <span className="w-24 shrink-0 text-right text-sm text-muted-foreground sm:w-32">
        {hasData ? `${row.approvedVideosCount} aprovado${row.approvedVideosCount === 1 ? '' : 's'}` : 'Sem dados'}
      </span>
    </li>
  )
}

/** Faixa verde-profunda do topo: média geral da equipe com o gesto do estado. */
function SummaryBanner({ rows }: { rows: EditorPerformance[] }) {
  const scored = rows.filter((r) => r.averageScore !== null)
  const avg = scored.length ? scored.reduce((sum, r) => sum + (r.averageScore ?? 0), 0) / scored.length : null
  const approved = rows.reduce((sum, r) => sum + r.approvedVideosCount, 0)
  const allMax = scored.length > 0 && scored.every((r) => (r.averageScore ?? 0) >= 9.95)
  const state = avg === null ? 'empty' : avg >= 8 ? 'check' : avg >= 6 ? 'attention' : 'critical'
  const message =
    avg === null
      ? 'Nada pra checar por aqui — ainda não há vídeos aprovados com nota.'
      : allMax
        ? 'Todos os editores com nota máxima nos vídeos aprovados deste mês.'
        : avg >= 8
          ? 'A equipe deu check: notas altas nos vídeos aprovados.'
          : avg >= 6
            ? 'Vale um check: algumas notas abaixo do esperado.'
            : 'Hora de um check-up: notas baixas nos vídeos aprovados.'

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-deep p-6 text-deep-foreground sm:flex-row sm:items-center sm:p-8">
      <Gesture state={state} onDeep className="h-24 w-auto sm:h-28" />
      <p className="min-w-0 flex-1 text-base text-deep-muted">{message}</p>
      <div className="flex shrink-0 gap-10">
        <div className="text-center">
          <p className="font-display text-4xl leading-none text-primary">
            {avg === null ? '—' : avg.toFixed(1).replace('.', ',')}
          </p>
          <p className="mt-2 text-sm text-deep-muted">nota média</p>
        </div>
        <div className="text-center">
          <p className="font-display text-4xl leading-none text-deep-foreground">{approved}</p>
          <p className="mt-2 text-sm text-deep-muted">vídeos aprovados</p>
        </div>
      </div>
    </div>
  )
}
