'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useMemo, useState } from 'react'
import {
  Plus,
  Search,
  Play,
  Film,
  X,
  Check,
  RotateCcw,
  MessageSquare,
  Lock,
  Users,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { videoService, teamService } from '@/lib/services'
import {
  productionStageLabel,
  type ProductionStage,
  type TeamMember,
  type Video,
} from '@/lib/types'
import { ClientAvatar } from '@/components/client-avatar'
import { DeadlineBadge } from '@/components/deadline-badge'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from '@/components/motion'
import { toast } from '@/lib/toast'

const COLUMNS: { stage: ProductionStage; dot: string }[] = [
  { stage: 'planejado', dot: 'bg-muted-foreground' },
  { stage: 'producao', dot: 'bg-sky-500' },
  { stage: 'edicao', dot: 'bg-violet-500' },
  { stage: 'aguardando_aprovacao', dot: 'bg-amber-500' },
  { stage: 'ajustes', dot: 'bg-orange-500' },
  { stage: 'aprovado', dot: 'bg-emerald-500' },
  { stage: 'entregue', dot: 'bg-foreground' },
]

const stageBadgeStyles: Record<ProductionStage, string> = {
  planejado: 'bg-secondary text-foreground',
  producao: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  edicao: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  aguardando_aprovacao: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  ajustes: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  aprovado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  entregue: 'bg-foreground text-background',
}

const ALL_CLIENTS = 'Todos os clientes'

export function KanbanView() {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'

  const { data, loading, error, refetch, setData } = useQuery<Video[]>(
    (signal) => videoService.list(undefined, signal),
    [],
  )
  const team = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])

  // Mesma regra do dashboard: só a versão mais recente de cada vídeo aparece no board.
  const videos = (data ?? []).filter((v) => v.latestVersionId === v.id)

  const [search, setSearch] = useState('')
  const [client, setClient] = useState(ALL_CLIENTS)
  const [dragOverColumn, setDragOverColumn] = useState<ProductionStage | null>(null)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)

  const clientNames = useMemo(() => {
    const set = new Set<string>()
    videos.forEach((v) => v.clientName && set.add(v.clientName))
    return [ALL_CLIENTS, ...Array.from(set).sort()]
  }, [videos])

  const filtered = videos.filter((v) => {
    const byClient = client === ALL_CLIENTS || v.clientName === client
    const bySearch = search.trim() === '' || v.title.toLowerCase().includes(search.trim().toLowerCase())
    return byClient && bySearch
  })

  const counts = {
    aguardando_aprovacao: videos.filter((v) => v.productionStage === 'aguardando_aprovacao').length,
    ajustes: videos.filter((v) => v.productionStage === 'ajustes').length,
    entregue: videos.filter((v) => v.productionStage === 'entregue').length,
  }

  async function moveVideo(id: string, stage: ProductionStage) {
    const previous = videos.find((v) => v.id === id)?.productionStage
    if (!previous || previous === stage) return
    setData((prev) => (prev ?? []).map((v) => (v.id === id ? { ...v, productionStage: stage } : v)))
    try {
      await videoService.updateStage(id, stage)
    } catch (err) {
      setData((prev) => (prev ?? []).map((v) => (v.id === id ? { ...v, productionStage: previous } : v)))
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível mover o vídeo.')
    }
  }

  const activeVideo = videos.find((v) => v.id === activeVideoId) ?? null
  const editorName = (editorId: string | null) => team.data?.find((m) => m.id === editorId)?.name ?? null

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">KANBAN</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Do planejamento à entrega, tudo num lugar só. Arraste os vídeos entre as etapas.
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

      {/* Cards de resumo */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryCard
          dot="bg-amber-500"
          label="Aguardando aprovação"
          value={counts.aguardando_aprovacao}
          hint="depende do cliente"
          loading={loading}
        />
        <SummaryCard dot="bg-orange-500" label="Em ajustes" value={counts.ajustes} hint="voltou pra equipe" loading={loading} />
        <SummaryCard dot="bg-foreground" label="Entregues" value={counts.entregue} hint="ciclo completo" loading={loading} />
        <SummaryCard dot="bg-muted-foreground" label="Total no quadro" value={videos.length} hint="todas as etapas" loading={loading} />
      </div>

      {/* Quadro */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fluxo de produção
        </h2>
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

      {loading ? (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <div key={col.stage} className="flex w-72 shrink-0 flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorState message={error} onRetry={refetch} />
        </div>
      ) : videos.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Film className="size-7" />}
            title="Nenhum vídeo enviado ainda"
            description="Envie seu primeiro vídeo pra ver o quadro em ação."
            action={
              isOwner && (
                <Link
                  href="/upload"
                  className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Plus className="size-4" /> Enviar vídeo
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="mt-4 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {COLUMNS.map((col) => {
            const columnVideos = filtered.filter((v) => v.productionStage === col.stage)
            return (
              <div
                key={col.stage}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverColumn(col.stage)
                }}
                onDragLeave={() => setDragOverColumn((prev) => (prev === col.stage ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) moveVideo(id, col.stage)
                  setDragOverColumn(null)
                }}
                className={cn(
                  'flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-transparent p-2 transition-colors',
                  dragOverColumn === col.stage && 'border-primary/40 bg-primary/5',
                )}
              >
                <div className="flex items-center gap-2 px-1">
                  <span className={cn('size-2 shrink-0 rounded-full', col.dot)} aria-hidden="true" />
                  <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
                    {productionStageLabel[col.stage]}
                  </h3>
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-foreground">
                    {columnVideos.length}
                  </span>
                </div>

                <div className="flex max-h-[65vh] min-h-24 flex-col gap-3 overflow-y-auto pb-1">
                  {columnVideos.map((v) => (
                    <VideoCard
                      key={v.id}
                      video={v}
                      editorName={editorName(v.editorId)}
                      onOpen={() => setActiveVideoId(v.id)}
                    />
                  ))}
                  {columnVideos.length === 0 && (
                    <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                      Arraste um vídeo pra cá
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {activeVideo && (
          <VideoDetailModal
            video={activeVideo}
            editorName={editorName(activeVideo.editorId)}
            isOwner={isOwner}
            onClose={() => setActiveVideoId(null)}
            onUpdateStage={(stage) => moveVideo(activeVideo.id, stage)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function SummaryCard({
  dot,
  label,
  value,
  hint,
  loading,
}: {
  dot: string
  label: string
  value: number
  hint: string
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className="mt-2 font-display text-3xl leading-none tracking-wide text-foreground sm:text-4xl">
          {value}
        </p>
      )}
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function VideoThumb({ video, className }: { video: Video; className?: string }) {
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg bg-secondary', className)}>
      {video.posterUrl ? (
        <Image src={video.posterUrl} alt="" fill className="object-cover" sizes="288px" unoptimized />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground/60">
          <Film className="size-6" />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="grid size-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm">
          <Play className="size-4 fill-white" />
        </span>
      </span>
      {video.duration > 0 && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(video.duration)}
        </span>
      )}
    </div>
  )
}

function VideoCard({
  video,
  editorName,
  onOpen,
}: {
  video: Video
  editorName: string | null
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', video.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onOpen}
      className="group flex cursor-grab flex-col rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 active:cursor-grabbing"
    >
      <VideoThumb video={video} className="aspect-video" />

      <div className="mt-2.5 flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground" title={video.title}>
          {video.title}
        </h4>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            stageBadgeStyles[video.productionStage],
          )}
        >
          {productionStageLabel[video.productionStage]}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{video.clientName}</p>

      <div className="mt-2.5 flex items-center justify-between">
        {editorName ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <ClientAvatar name={editorName} seed={video.editorId ?? editorName} size="sm" />
            <span className="truncate text-xs font-medium text-foreground">{editorName}</span>
          </div>
        ) : (
          <span className="truncate text-xs text-muted-foreground">Sem responsável</span>
        )}
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3.5" fill={video.commentsCount > 0 ? 'currentColor' : 'none'} />
          {video.commentsCount}
        </span>
      </div>

      <DeadlineBadge deadline={video.deadline} className="mt-2.5 w-fit" />
    </button>
  )
}

function VideoDetailModal({
  video,
  editorName,
  isOwner,
  onClose,
  onUpdateStage,
}: {
  video: Video
  editorName: string | null
  isOwner: boolean
  onClose: () => void
  onUpdateStage: (stage: ProductionStage) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="grid w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-2xl md:grid-cols-2"
      >
        <VideoThumb video={video} className="aspect-video md:aspect-auto md:h-full" />

        <div className="flex max-h-[85vh] flex-col overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                stageBadgeStyles[video.productionStage],
              )}
            >
              {productionStageLabel[video.productionStage]}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70"
            >
              <X className="size-4" />
            </button>
          </div>

          <h2 className="mt-3 truncate text-2xl font-bold text-foreground" title={video.title}>
            {video.title}
          </h2>
          <p className="text-sm text-muted-foreground">{video.clientName}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            {editorName ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <ClientAvatar name={editorName} seed={video.editorId ?? editorName} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{editorName}</p>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sem responsável atribuído</p>
            )}
            <DeadlineBadge deadline={video.deadline} />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              href={`/videos/${video.id}/revisao`}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
            >
              <span className="flex items-center gap-2">
                <Lock className="size-4 text-muted-foreground" />
                Revisão interna
              </span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </Link>
            {isOwner && (
              <Link
                href={`/videos/${video.id}/canal-cliente`}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  Canal do cliente
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Link>
            )}
          </div>

          {/* Ação rápida só faz sentido nesta etapa — nas demais, mover pelo seletor abaixo */}
          {video.productionStage === 'aguardando_aprovacao' && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onUpdateStage('ajustes')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-primary bg-transparent font-display text-lg tracking-wide text-primary transition-colors hover:bg-primary/10"
              >
                <RotateCcw className="size-4" />
                PEDIR AJUSTES
              </button>
              <button
                type="button"
                onClick={() => onUpdateStage('aprovado')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Check className="size-4" />
                APROVAR
              </button>
            </div>
          )}

          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">Mover para outra etapa</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {COLUMNS.map((col) => (
                <button
                  key={col.stage}
                  type="button"
                  onClick={() => onUpdateStage(col.stage)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    col.stage === video.productionStage
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', col.dot)} aria-hidden="true" />
                  {productionStageLabel[col.stage]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
