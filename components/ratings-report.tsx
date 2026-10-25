'use client'

/**
 * Aba "Avaliações" de /relatorios — notas que os clientes deram às entregas
 * (`GET /reports/ratings`). O backend devolve as notas cruas e a agregação
 * fica aqui, no mesmo espírito da aba de produtividade.
 *
 * As notas sobrevivem à exclusão do vídeo, do projeto ou do cliente (o
 * backend guarda os nomes na própria nota), então "Liberar armazenamento" e
 * excluir projeto não apagam esse histórico. Nota sem pergunta
 * (`questionId: null`) é a nota geral dada na aprovação.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Star, ThumbsUp, ThumbsDown, PackageCheck, Download, TrendingUp, Contact, AlertTriangle, ListChecks } from 'lucide-react'
import { reportService } from '@/lib/services'
import type { RatingRecord, RatingsReport } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { StaggerList, staggerItem, motion } from '@/components/motion'
import { cn } from '@/lib/utils'

type Period = '30' | '90' | '180' | '365' | 'all'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 3 meses' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: '365', label: 'Último ano' },
  { value: 'all', label: 'Todo o período' },
]

const ALL_CLIENTS = '__todos__'
const LOW_SCORE = 2
const ATTENTION_AVG = 3.5
const LOW_LIST_LIMIT = 8

function average(scores: number[]): number | null {
  if (scores.length === 0) return null
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

function formatScore(value: number | null): string {
  return value === null ? '—' : value.toFixed(1).replace('.', ',')
}

/** Uma "entrega" = um vídeo avaliado. Vídeo excluído não tem id: usa projeto + título. */
function deliveryKey(r: RatingRecord): string {
  return r.videoId ?? `${r.projectName}|${r.videoTitle}`
}

function clientKey(r: RatingRecord): string {
  return r.clientId ?? `avulso:${r.clientName}`
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const month = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${month.charAt(0).toUpperCase()}${month.slice(1)}/${String(y).slice(2)}`
}

function last6Months(): string[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return monthKey(d.toISOString())
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(rows: string[][], filename: string) {
  const content = rows.map((r) => r.map(csvCell).join(';')).join('\r\n')
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

export function RatingsReportView() {
  const [period, setPeriod] = useState<Period>('180')
  const [clientFilter, setClientFilter] = useState(ALL_CLIENTS)

  const query = useQuery<RatingsReport>(
    (signal) => {
      const from = period === 'all' ? undefined : new Date(Date.now() - Number(period) * 24 * 3600_000).toISOString()
      return reportService.ratings({ from }, signal)
    },
    [period],
  )

  const allRatings = useMemo(() => query.data?.ratings ?? [], [query.data])
  const questions = useMemo(() => query.data?.questions ?? [], [query.data])

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of allRatings) map.set(clientKey(r), r.clientName || 'Sem nome')
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [allRatings])

  const ratings = useMemo(
    () => (clientFilter === ALL_CLIENTS ? allRatings : allRatings.filter((r) => clientKey(r) === clientFilter)),
    [allRatings, clientFilter],
  )

  const summary = useMemo(() => {
    const scores = ratings.map((r) => r.score)
    return {
      avg: average(scores),
      deliveries: new Set(ratings.map(deliveryKey)).size,
      highShare: scores.length ? Math.round((scores.filter((s) => s >= 4).length / scores.length) * 100) : null,
      lowCount: scores.filter((s) => s <= LOW_SCORE).length,
    }
  }, [ratings])

  // Nota geral primeiro, depois as perguntas na ordem da conta. Pergunta
  // desativada só aparece se tiver nota no período.
  const byQuestion = useMemo(() => {
    const rows = [
      { id: null as string | null, text: 'Nota geral', active: true },
      ...questions.map((q) => ({ id: q.id as string | null, text: q.text, active: q.active })),
    ]
    return rows
      .map((q) => {
        const scores = ratings.filter((r) => r.questionId === q.id).map((r) => r.score)
        return { ...q, avg: average(scores), count: scores.length }
      })
      .filter((q) => q.count > 0 || (q.active && q.id !== null))
  }, [ratings, questions])

  const monthly = useMemo(() => {
    const months = last6Months()
    return months.map((key) => {
      const scores = ratings.filter((r) => monthKey(r.createdAt) === key).map((r) => r.score)
      return { key, label: monthLabel(key), avg: average(scores), count: scores.length }
    })
  }, [ratings])

  // Menos satisfeito primeiro: a lista existe pra achar onde melhorar.
  const byClient = useMemo(() => {
    const groups = new Map<string, RatingRecord[]>()
    for (const r of allRatings) groups.set(clientKey(r), [...(groups.get(clientKey(r)) ?? []), r])
    return [...groups.entries()]
      .map(([key, items]) => ({
        key,
        name: items[0].clientName || 'Sem nome',
        avulso: !items[0].clientId,
        avg: average(items.map((r) => r.score)) ?? 0,
        deliveries: new Set(items.map(deliveryKey)).size,
        lastAt: items.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), ''),
      }))
      .sort((a, b) => a.avg - b.avg || b.deliveries - a.deliveries)
  }, [allRatings])

  const lowDeliveries = useMemo(() => {
    const groups = new Map<string, RatingRecord[]>()
    for (const r of ratings) groups.set(deliveryKey(r), [...(groups.get(deliveryKey(r)) ?? []), r])
    const questionText = new Map(questions.map((q) => [q.id, q.text]))
    return [...groups.values()]
      .map((items) => {
        // Uma etiqueta por pergunta, com a pior nota (o vídeo pode ter sido
        // aprovado mais de uma vez).
        const low = new Map<string, number>()
        for (const r of items) {
          if (r.score > LOW_SCORE) continue
          const label = r.questionId ? questionText.get(r.questionId) ?? 'Pergunta removida' : 'Nota geral'
          low.set(label, Math.min(r.score, low.get(label) ?? r.score))
        }
        return {
          first: items[0],
          avg: average(items.map((r) => r.score)) ?? 0,
          low: [...low.entries()].map(([label, score]) => ({ label, score })),
          lastAt: items.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), ''),
        }
      })
      .filter((d) => d.low.length > 0)
      .sort((a, b) => a.avg - b.avg || b.lastAt.localeCompare(a.lastAt))
  }, [ratings, questions])

  const [showAllLow, setShowAllLow] = useState(false)

  function exportCsv() {
    const questionText = new Map(questions.map((q) => [q.id, q.text]))
    const periodLabel = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? ''
    downloadCsv(
      [
        ['Avaliações dos clientes — Check', periodLabel],
        [],
        ['Data', 'Cliente', 'Projeto', 'Vídeo', 'Pergunta', 'Nota', 'Situação'],
        ...ratings.map((r) => [
          formatDate(r.createdAt),
          r.clientName,
          r.projectName,
          r.videoTitle,
          r.questionId ? questionText.get(r.questionId) ?? '' : 'Nota geral',
          String(r.score),
          r.deleted ? 'Vídeo excluído' : '',
        ]),
      ],
      `avaliacoes-check-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const selectClass =
    'min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary-ink'

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={exportCsv}
          disabled={ratings.length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
        >
          <Download className="size-4" /> CSV
        </button>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          aria-label="Cliente"
          className={cn(selectClass, 'max-w-[14rem]')}
        >
          <option value={ALL_CLIENTS}>Todos os clientes</option>
          {clientOptions.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          aria-label="Período"
          className={selectClass}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {query.loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : query.error ? (
        <div className="mt-6">
          <ErrorState message={query.error} onRetry={query.refetch} />
        </div>
      ) : ratings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Star className="size-7" />}
            title="Nenhuma avaliação no período"
            description="Quando os clientes derem nota às entregas pelo link de aprovação, as notas aparecem aqui."
          />
        </div>
      ) : (
        <>
          <StaggerList className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi
              icon={<Star className="size-4" />}
              label="Média geral"
              value={formatScore(summary.avg)}
              suffix="de 5"
            />
            <Kpi icon={<PackageCheck className="size-4" />} label="Entregas avaliadas" value={String(summary.deliveries)} />
            <Kpi
              icon={<ThumbsUp className="size-4" />}
              label="Notas 4 ou 5"
              value={summary.highShare === null ? '—' : `${summary.highShare}%`}
            />
            <Kpi
              icon={<ThumbsDown className="size-4" />}
              label="Notas baixas (1–2)"
              value={String(summary.lowCount)}
              tone={summary.lowCount > 0 ? 'warn' : undefined}
            />
          </StaggerList>

          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {/* Média por pergunta */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <ListChecks className="size-4 text-muted-foreground" /> Média por pergunta
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">De 1 a 5. A nota geral é a que o cliente dá ao aprovar.</p>
              <ul className="mt-4 space-y-3">
                {byQuestion.map((q) => (
                  <li key={q.id ?? 'geral'} title={`${q.text}: ${formatScore(q.avg)} (${q.count} ${q.count === 1 ? 'nota' : 'notas'})`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={cn('min-w-0 truncate', q.id === null ? 'font-semibold text-foreground' : 'text-foreground')}>
                        {q.text}
                        {!q.active && <span className="ml-1.5 text-xs text-muted-foreground">(desativada)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-semibold text-foreground">{formatScore(q.avg)}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">{q.count}</span>
                      </span>
                    </div>
                    <ScoreBar value={q.avg} />
                  </li>
                ))}
              </ul>
            </section>

            {/* Evolução mensal */}
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <TrendingUp className="size-4 text-muted-foreground" /> Evolução da satisfação
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Média das notas por mês, últimos 6 meses.</p>
              <div className="mt-4 flex items-end gap-3 sm:gap-5">
                {monthly.map((m) => {
                  const hasData = m.avg !== null
                  return (
                    <div
                      key={m.key}
                      className={cn('flex flex-1 flex-col items-center gap-1.5', !hasData && 'opacity-30')}
                      title={hasData ? `${m.label}: média ${formatScore(m.avg)} (${m.count} ${m.count === 1 ? 'nota' : 'notas'})` : `${m.label}: sem notas`}
                    >
                      <span className={cn('text-xs tabular-nums', hasData ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                        {formatScore(m.avg)}
                      </span>
                      <div className="flex h-28 w-full items-end overflow-hidden rounded-md bg-secondary">
                        {hasData && (
                          <div
                            className="w-full rounded-t-md bg-primary transition-all"
                            style={{ height: `${((m.avg ?? 0) / 5) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className={cn('text-[11px]', hasData ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {m.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          {/* Por cliente */}
          {clientFilter === ALL_CLIENTS && byClient.length > 0 && (
            <section className="mt-6 rounded-xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Contact className="size-4 text-muted-foreground" /> Satisfação por cliente
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Do menos ao mais satisfeito — quem está no topo merece atenção.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Cliente</th>
                      <th className="py-2 pr-3 font-medium">Média</th>
                      <th className="py-2 pr-3 text-right font-medium">Entregas</th>
                      <th className="py-2 text-right font-medium">Última nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byClient.map((c) => (
                      <tr key={c.key} className="border-b border-border/60 last:border-b-0">
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() => setClientFilter(c.key)}
                            className="text-left font-medium text-foreground hover:text-primary-ink hover:underline"
                          >
                            {c.name}
                          </button>
                          {c.avulso && <span className="ml-1.5 text-xs text-muted-foreground">avulso</span>}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 font-semibold tabular-nums text-foreground">{formatScore(c.avg)}</span>
                            <ScoreBar value={c.avg} className="mt-0 w-24" />
                            {c.avg < ATTENTION_AVG && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="size-3" /> Atenção
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">{c.deliveries}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatDate(c.lastAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Notas baixas */}
          <section className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <ThumbsDown className="size-4 text-muted-foreground" /> Onde melhorar
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Entregas com alguma nota 1 ou 2, da pior média para a melhor.</p>
            {lowDeliveries.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma nota baixa no período. 🎉</p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-border/60">
                  {(showAllLow ? lowDeliveries : lowDeliveries.slice(0, LOW_LIST_LIMIT)).map((d) => {
                    const content = (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {d.first.videoTitle}
                            {d.first.deleted && (
                              <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                                excluído
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[d.first.clientName, d.first.projectName].filter(Boolean).join(' · ')} · {formatDate(d.lastAt)}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-1.5">
                            {d.low.map((l) => (
                              <span
                                key={l.label}
                                className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive"
                              >
                                {l.label}: {l.score}
                              </span>
                            ))}
                          </p>
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums text-foreground">{formatScore(d.avg)}</span>
                          <span className="text-[11px] text-muted-foreground">média</span>
                        </span>
                      </>
                    )
                    return (
                      <li key={deliveryKey(d.first)}>
                        {d.first.videoId ? (
                          <Link
                            href={`/videos/${d.first.videoId}/revisao`}
                            className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-3 text-sm transition-colors hover:bg-secondary/60"
                          >
                            {content}
                          </Link>
                        ) : (
                          <div className="flex items-start gap-3 py-3 text-sm">{content}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {lowDeliveries.length > LOW_LIST_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAllLow((v) => !v)}
                    className="mt-2 text-xs font-medium text-primary-ink hover:underline print:hidden"
                  >
                    {showAllLow ? 'Mostrar menos' : `Ver todas (${lowDeliveries.length})`}
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}

function ScoreBar({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={cn('mt-1.5 h-2 overflow-hidden rounded-full bg-secondary', className)}>
      {value !== null && (
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(value / 5) * 100}%` }} />
      )}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  suffix?: string
  tone?: 'warn'
}) {
  return (
    <motion.div variants={staggerItem} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn(tone === 'warn' ? 'text-destructive' : 'text-muted-foreground')}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-display text-3xl leading-none tracking-wide text-foreground sm:text-4xl">
        {value}
        {suffix && <span className="ml-1.5 font-sans text-xs font-normal tracking-normal text-muted-foreground">{suffix}</span>}
      </p>
    </motion.div>
  )
}
