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
  Pencil,
  Sparkles,
  Trash2,
  Loader2,
  Lock,
  Users,
  Play,
  Search,
  Link2,
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
import { toast } from '@/lib/toast'

const filters: { key: 'todos' | VideoStatus; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendente', label: 'Pendentes' },
  { key: 'aprovado', label: 'Aprovados' },
  { key: 'ajuste', label: 'Ajustes' },
]

const ALL_CLIENTS = 'Todos os clientes'

/** Passos do fluxo completo, mostrados no checklist do banner de onboarding. */
const onboardingSteps: { icon: typeof Film; label: string }[] = [
  { icon: Film, label: 'Envie um vídeo' },
  { icon: Link2, label: 'Compartilhe o link com o cliente' },
  { icon: MessageSquare, label: 'O cliente comenta ou aprova' },
  { icon: Users, label: 'Revise internamente com sua equipe' },
]

export function DashboardView() {
  const [client, setClient] = useState(ALL_CLIENTS)
  const [status, setStatus] = useState<'todos' | VideoStatus>('todos')
  const [search, setSearch] = useState('')

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
      toast.success('Dados de exemplo excluídos')
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
    const bySearch = search.trim() === '' || v.title.toLowerCase().includes(search.trim().toLowerCase())
    return byClient && byStatus && bySearch
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

      {/* Visão geral: pendentes +48h, aprovados no mês, em ajustes, cliente mais rápido */}
      <OverviewRow
        insights={insights}
        pending={pending}
        approved={approved}
        adjust={adjust}
        loadingVideos={loading}
      />

      {/* Filters */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {filters.map((f) => {
            const count = f.key === 'todos' ? videos.length : videos.filter((v) => v.status === f.key).length
            const active = status === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
                <span
                  className={cn(
                    'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    active ? 'bg-background/20 text-background' : 'bg-border text-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por arquivo..."
              className="min-h-11 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary sm:w-56"
            />
          </div>
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
        </div>
      </div>

      {/* Video list */}
      <div className="mt-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
                <Skeleton className="aspect-video w-full" />
                <div className="space-y-2 p-3">
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VideoCard({ video: v }: { video: Video }) {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  // Link principal (o card inteiro) leva à tela pública do cliente. As ações da
  // agência ficam acima com z-index maior (padrão "stretched link", sem aninhar
  // âncoras dentro de âncoras).
  const publicHref = v.publicLink ? `/v/${v.publicLink}` : null

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
      {publicHref && (
        <Link
          href={publicHref}
          aria-label={`Abrir link do cliente de ${v.title}`}
          className="absolute inset-0 z-[1]"
        />
      )}

      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-secondary">
        <Image
          src={v.posterUrl || '/placeholder.svg'}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          unoptimized
        />
        <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <div className="rounded-full bg-black/30 backdrop-blur-sm">
            <StatusBadge status={v.status} />
          </div>
          {v.isExample && (
            <span
              title="Este é um item de exemplo — explore e delete quando quiser."
              className="inline-flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground backdrop-blur-sm"
            >
              <Sparkles className="size-3" /> Exemplo
            </span>
          )}
        </div>
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="grid size-11 place-items-center rounded-full bg-black/45 text-white transition-transform group-hover:scale-105">
            <Play className="size-4.5 fill-white" />
          </span>
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(v.duration)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="w-fit rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {v.type}
        </span>
        <h3 className="truncate font-medium text-foreground" title={v.title}>
          {v.title}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate font-semibold text-primary" title={v.clientName}>
            {v.clientName}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Clock className="size-3.5" />
            {formatSentAt(v.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3.5" />
          {v.commentsCount}
        </div>

        {/* Ações da agência (acima do link do card) */}
        <div className="relative z-[2] mt-1 flex flex-wrap gap-2">
          <Link
            href={`/videos/${v.id}/revisao`}
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
          >
            <Lock className="size-3.5" />
            Revisão interna
          </Link>
          {isOwner && (
            <Link
              href={`/videos/${v.id}/canal-cliente`}
              className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
            >
              <Users className="size-3.5" />
              Canal do cliente
            </Link>
          )}
        </div>
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

      {/* Checklist do fluxo completo: enviar → compartilhar → cliente decide → revisão interna. */}
      <ol className="mt-4 grid gap-2 border-t border-primary/20 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        {onboardingSteps.map((step, i) => (
          <li key={step.label} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
              {i + 1}
            </span>
            <span>
              <step.icon className="mb-0.5 mr-1 inline size-3.5 text-primary" />
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </motion.div>
  )
}

function OverviewRow({
  insights,
  pending,
  approved,
  adjust,
  loadingVideos,
}: {
  insights: {
    data: DashboardInsights | null
    loading: boolean
    error: string | null
  }
  pending: number
  approved: number
  adjust: number
  loadingVideos: boolean
}) {
  if (loadingVideos || insights.loading) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const data = insights.data
  const pendingOver48h = data?.pendingOver48h ?? pending
  const approvedThisMonth = data?.approvedThisMonth ?? approved
  const fastestClient = data?.fastestClient ?? null
  const hasPendingAlert = pendingOver48h > 0

  return (
    <StaggerList className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <motion.div
        variants={staggerItem}
        className={cn(
          'col-span-2 flex items-center gap-3 rounded-xl border p-4 sm:col-span-1',
          hasPendingAlert ? 'border-primary/40 bg-primary text-primary-foreground' : 'border-border bg-card',
        )}
      >
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-full',
            hasPendingAlert ? 'bg-primary-foreground/15' : 'bg-secondary text-muted-foreground',
          )}
        >
          <AlarmClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-3xl leading-none tracking-wide sm:text-4xl">
            {pendingOver48h}
          </p>
          <p
            className={cn(
              'mt-1 text-xs',
              hasPendingAlert ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {hasPendingAlert ? 'pendentes há +48h · vale um lembrete' : 'pendentes há +48h · tudo em dia'}
          </p>
        </div>
      </motion.div>

      <OverviewCard
        icon={<CircleCheckBig className="size-4" />}
        label="Aprovados no mês"
        value={approvedThisMonth}
        hint="Total do mês atual"
      />
      <OverviewCard
        icon={<Pencil className="size-4" />}
        label="Em ajustes"
        value={adjust}
        hint="Aguardando revisão"
      />
      <OverviewCard
        icon={<Zap className="size-4" />}
        label="Cliente + rápido"
        value={fastestClient ? fastestClient.name : '—'}
        hint={fastestClient ? `~${fastestClient.avgHours}h em média` : 'Sem dados ainda'}
      />
    </StaggerList>
  )
}

function OverviewCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  hint?: string
}) {
  const numeric = typeof value === 'number'
  return (
    <motion.div variants={staggerItem} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <p
        className={cn(
          'mt-2 leading-none tracking-wide text-foreground',
          numeric ? 'font-display text-3xl sm:text-4xl' : 'truncate text-xl font-semibold',
        )}
        title={numeric ? undefined : String(value)}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </motion.div>
  )
}
