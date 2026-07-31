'use client'

/**
 * Desempenho da equipe (/equipe/desempenho) — owner-only. Uma barra horizontal
 * por editor: avatar, nome, trilho 0-10 colorido pela faixa (GET
 * /team/performance) e a contagem de vídeos aprovados. A trilha usa um
 * cinza-escuro sutil para as cores de status se destacarem no fundo preto.
 */
import { useState } from 'react'
import { ArrowDownUp, BarChart3 } from 'lucide-react'
import { teamPerformanceService } from '@/lib/services'
import type { EditorPerformance, PerformanceTier } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import { motion, useReducedMotion } from '@/components/motion'

const tierFillClass: Record<Exclude<PerformanceTier, 'sem_dados'>, string> = {
  verde: 'bg-emerald-500',
  amarelo: 'bg-yellow-400',
  laranja: 'bg-orange-500',
  vermelho: 'bg-red-500',
}

const tierTextClass: Record<Exclude<PerformanceTier, 'sem_dados'>, string> = {
  verde: 'text-emerald-950',
  amarelo: 'text-yellow-950',
  laranja: 'text-orange-950',
  vermelho: 'text-red-50',
}

type SortMode = 'score' | 'count'

export function TeamPerformanceView() {
  const { data, loading, error, refetch } = useQuery<EditorPerformance[]>(
    (signal) => teamPerformanceService.list(signal),
    [],
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">DESEMPENHO DA EQUIPE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nota média dos vídeos aprovados por editor, de 0 a 10.
          </p>
        </div>

        {!loading && !error && (rows.length ?? 0) > 0 && (
          <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1 text-xs">
            <SortButton active={sortMode === 'score'} onClick={() => setSortMode('score')}>
              Nota média
            </SortButton>
            <SortButton active={sortMode === 'count'} onClick={() => setSortMode('count')}>
              Vídeos aprovados
            </SortButton>
          </div>
        )}
      </div>

      <div className="mt-6">
        {loading ? (
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
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <PerformanceRow key={r.editorId} row={r} />
            ))}
          </ul>
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
        'inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <ArrowDownUp className="size-3.5" />
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
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:gap-4 sm:p-4">
      {/* Avatar */}
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold text-foreground sm:size-11">
        {initials(row.name)}
      </span>

      {/* Nome */}
      <span
        className="w-24 shrink-0 truncate text-sm font-medium text-foreground sm:w-32"
        title={row.name || 'Sem nome'}
      >
        {row.name || 'Sem nome'}
      </span>

      {/* Trilho + preenchimento */}
      <div className="relative h-8 min-w-0 flex-1 overflow-hidden rounded-full bg-[#232328]">
        {hasData ? (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'flex h-full items-center rounded-full px-3',
              tierFillClass[row.tier as Exclude<PerformanceTier, 'sem_dados'>],
            )}
          >
            <span
              className={cn(
                'font-display text-lg leading-none tracking-wide whitespace-nowrap',
                tierTextClass[row.tier as Exclude<PerformanceTier, 'sem_dados'>],
              )}
            >
              {row.averageScore!.toFixed(1)}
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
      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground sm:w-28">
        {hasData ? `${row.approvedVideosCount} aprovado${row.approvedVideosCount === 1 ? '' : 's'}` : 'Sem dados'}
      </span>
    </li>
  )
}
