'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Plus,
  MessageSquare,
  Clock,
  Film,
  AlarmClock,
  Zap,
  CircleCheckBig,
  Sparkles,
  Trash2,
  Loader2,
  Lock,
  Users,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { dashboardService, sampleDataService, videoService } from '@/lib/services'
import type { DashboardInsights, Video, VideoStatus } from '@/lib/types'
import { StatusBadge } from '@/components/status-badge'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { formatDuration, formatSentAt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StaggerList, staggerItem, motion, AnimatePresence } from '@/components/motion'

const filters: { key: 'todos' | VideoStatus; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'aprovado', label: 'Aprovados' },
  { key: 'ajuste', label: 'Ajustes' },
]

const ALL_CLIENTS = 'Todos os clientes'

export function DashboardView() {
  const [client, setClient] = useState(ALL_CLIENTS)
  const [status, setStatus] = useState<'todos' | VideoStatus>('todos')

  const { data, loading, error, refetch } = useQuery<Video[]>(
    (signal) => videoService.list(undefined, signal),
    [],
  )

  const insights = useQuery<DashboardInsights>(
    (signal) => dashboardService.insights(signal),
    [],
  )

  const videos = data ?? []
  const hasExamples = videos.some((v) => v.isExample)

  const [deletingExamples, setDeletingExamples] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function deleteExamples() {
    setDeletingExamples(true)
    setDeleteError(null)
    try {
      await sampleDataService.remove()
      refetch()
      insights.refetch()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Não foi possível excluir os exemplos.')
    } finally {
      setDeletingExamples(false)
    }
  }

  const clientNames = useMemo(() => {
    const set = new Set<string>()
    videos.forEach((v) => v.clientName && set.add(v.clientName))
    return [ALL_CLIENTS, ...Array.from(set).sort()]
  }, [videos])

  const filtered = videos.filter((v) => {
    const byClient = client === ALL_CLIENTS || v.clientName === client
    const byStatus = status === 'todos' || v.status === status
    return byClient && byStatus
  })

  const pending = videos.filter((v) => v.status === 'pendente').length
  const approved = videos.filter((v) => v.status === 'aprovado').length
  const adjust = videos.filter((v) => v.status === 'ajuste').length

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">
            SEUS VÍDEOS
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o status de cada envio e o retorno dos clientes.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-5" />
          ENVIAR NOVO VÍDEO
        </Link>
      </div>

      {/* Onboarding: banner do projeto de exemplo (is_exemplo) */}
      <AnimatePresence>
        {hasExamples && (
          <OnboardingBanner
            onDelete={deleteExamples}
            deleting={deletingExamples}
            error={deleteError}
          />
        )}
      </AnimatePresence>

      {/* Insights em destaque (GET /dashboard/insights) */}
      <InsightsRow query={insights} />

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Pendentes" value={pending} accent loading={loading} />
        <StatCard label="Aprovados" value={approved} loading={loading} />
        <StatCard label="Ajustes" value={adjust} loading={loading} />
      </div>

      {/* Filters */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cn(
                'min-h-11 rounded-lg px-4 text-sm font-medium transition-colors',
                status === f.key
                  ? 'bg-foreground text-background'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Cliente:</span>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            {clientNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Video list */}
      <div className="mt-6">
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-3">
                <Skeleton className="aspect-video w-28 shrink-0 sm:w-40" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : filtered.length === 0 ? (
          videos.length === 0 ? (
            <EmptyState
              icon={<Film className="size-7" />}
              title="Nenhum vídeo enviado ainda"
              description="Envie seu primeiro vídeo para gerar um link de aprovação."
              action={
                <Link
                  href="/upload"
                  className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Plus className="size-4" /> Enviar vídeo
                </Link>
              }
            />
          ) : (
            <EmptyState
              title="Nenhum vídeo encontrado"
              description="Nenhum vídeo corresponde aos filtros selecionados."
            />
          )
        ) : (
          <div className="grid gap-3">
            {filtered.map((v) => (
              <VideoRow key={v.id} video={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VideoRow({ video: v }: { video: Video }) {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  // Link principal (o card inteiro) leva à tela pública do cliente. As ações da
  // agência ficam acima com z-index maior (padrão "stretched link", sem aninhar
  // âncoras dentro de âncoras).
  const publicHref = v.publicLink ? `/v/${v.publicLink}` : null

  return (
    <div className="group relative flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50 sm:flex-row sm:items-center sm:gap-4">
      {publicHref && (
        <Link
          href={publicHref}
          aria-label={`Abrir link do cliente de ${v.title}`}
          className="absolute inset-0 z-[1] rounded-xl"
        />
      )}

      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-secondary sm:w-40">
        <Image
          src={v.posterUrl || '/placeholder.svg'}
          alt=""
          fill
          className="object-cover"
          sizes="160px"
          unoptimized
        />
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(v.duration)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {v.type}
          </span>
          <StatusBadge status={v.status} />
          {v.isExample && (
            <span
              title="Este é um item de exemplo — explore e delete quando quiser."
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
            >
              <Sparkles className="size-3" /> Exemplo
            </span>
          )}
        </div>
        <h3 className="mt-1.5 truncate font-medium text-foreground">{v.title}</h3>
        <p className="truncate text-sm text-muted-foreground">{v.clientName}</p>
        <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatSentAt(v.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" />
            {v.commentsCount}
          </span>
        </div>
      </div>

      {/* Ações da agência (acima do link do card) */}
      <div className="relative z-[2] flex shrink-0 flex-wrap gap-2 sm:flex-col">
        <Link
          href={`/videos/${v.id}/revisao`}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
        >
          <Lock className="size-3.5" />
          Revisão interna
        </Link>
        {isOwner && (
          <Link
            href={`/videos/${v.id}/canal-cliente`}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            <Users className="size-3.5" />
            Canal do cliente
          </Link>
        )}
      </div>
    </div>
  )
}

function OnboardingBanner({
  onDelete,
  deleting,
  error,
}: {
  onDelete: () => void
  deleting: boolean
  error: string | null
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-6 rounded-xl border border-primary/40 bg-primary/10 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              Este é um projeto de exemplo
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Explore o fluxo completo à vontade e delete os dados de exemplo quando quiser.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Confirmar exclusão
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="inline-flex min-h-9 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
            >
              <Trash2 className="size-3.5" /> Excluir exemplos
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </motion.div>
  )
}

function InsightsRow({
  query,
}: {
  query: {
    data: DashboardInsights | null
    loading: boolean
    error: string | null
  }
}) {
  if (query.loading) {
    return (
      <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  // Insights são complementares: em caso de erro, apenas não renderiza a faixa.
  if (query.error || !query.data) return null

  const { pendingOver48h, fastestClient, approvedThisMonth } = query.data

  return (
    <StaggerList className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
      <InsightCard
        icon={<AlarmClock className="size-4" />}
        label="Pendentes há +48h"
        value={pendingOver48h}
        hint={pendingOver48h > 0 ? 'Vale um lembrete ao cliente' : 'Tudo em dia'}
        accent={pendingOver48h > 0}
      />
      <InsightCard
        icon={<Zap className="size-4" />}
        label="Cliente mais rápido"
        value={fastestClient ? fastestClient.name : '—'}
        hint={
          fastestClient ? `Aprova em ~${fastestClient.avgHours}h em média` : 'Sem dados ainda'
        }
      />
      <InsightCard
        icon={<CircleCheckBig className="size-4" />}
        label="Aprovados no mês"
        value={approvedThisMonth}
        hint="Total do mês atual"
      />
    </StaggerList>
  )
}

function InsightCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
  accent?: boolean
}) {
  const numeric = typeof value === 'number'
  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        'rounded-xl border p-4',
        accent ? 'border-primary/40 bg-primary/10' : 'border-border bg-card',
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn(accent ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>
        {label}
      </div>
      <p
        className={cn(
          'mt-2 leading-none tracking-wide',
          numeric ? 'font-display text-4xl sm:text-5xl' : 'truncate text-2xl font-semibold',
          accent ? 'text-primary' : 'text-foreground',
        )}
        title={numeric ? undefined : String(value)}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </motion.div>
  )
}

function StatCard({
  label,
  value,
  accent,
  loading,
}: {
  label: string
  value: number
  accent?: boolean
  loading?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        accent ? 'border-primary/40 bg-primary/10' : 'border-border bg-card',
      )}
    >
      {loading ? (
        <Skeleton className="h-10 w-10" />
      ) : (
        <p
          className={cn(
            'font-display text-4xl leading-none tracking-wide sm:text-5xl',
            accent ? 'text-primary' : 'text-foreground',
          )}
        >
          {value}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{label}</p>
    </div>
  )
}
