'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import {
  Plus,
  MessageSquare,
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
  MoreVertical,
  ExternalLink,
  CircleX,
  Download,
  LayoutGrid,
  UserCog,
  AlertTriangle,
  CalendarClock,
  FolderOpen,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import {
  calendarService,
  clientService,
  dashboardService,
  demandService,
  publicService,
  projectService,
  sampleDataService,
  teamService,
  videoService,
} from '@/lib/services'
import {
  productionStageLabel,
  statusLabel,
  type Client,
  type DashboardInsights,
  type Demand,
  type ProductionStage,
  type Project,
  type CalendarActivity,
  type TeamMember,
  type Video,
  type VideoStatus,
} from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { formatDuration, formatSentAtCompact } from '@/lib/format'
import { triggerDownload } from '@/lib/download'
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

const STAGES = Object.keys(productionStageLabel) as ProductionStage[]

// Cor por etapa (barra de "Produção por etapa") — azul = em produção/edição,
// laranja = aguardando decisão do cliente, vermelho = voltou pra ajustes,
// verde = aprovado, cinza = planejado/entregue (pontas neutras do fluxo).
const STAGE_COLOR: Record<ProductionStage, string> = {
  planejado: 'bg-gray-300',
  producao: 'bg-blue-500',
  edicao: 'bg-blue-500',
  aguardando_aprovacao: 'bg-amber-500',
  ajustes: 'bg-red-500',
  aprovado: 'bg-emerald-500',
  entregue: 'bg-gray-400',
}

/**
 * Vídeos com comentário mais recente ficam no topo. Sem nenhum comentário,
 * cai pro fim da lista, ordenado entre si pelo envio mais recente.
 * `activity` complementa `lastCommentAt` (raramente vem da API de listagem)
 * com a data calculada a partir do endpoint público — ver efeito acima.
 */
function byMostRecentComment(a: Video, b: Video, activity: Record<string, string>): number {
  const aLast = activity[a.id] ?? a.lastCommentAt
  const bLast = activity[b.id] ?? b.lastCommentAt
  const aTime = aLast ? new Date(aLast).getTime() : null
  const bTime = bLast ? new Date(bLast).getTime() : null
  if (aTime !== null && bTime !== null) return bTime - aTime
  if (aTime !== null) return -1
  if (bTime !== null) return 1
  const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0
  const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0
  return bCreated - aCreated
}

/** Passos do fluxo completo, mostrados no checklist do banner de onboarding. */
const onboardingSteps: { icon: typeof Film; label: string }[] = [
  { icon: Film, label: 'Envie um vídeo' },
  { icon: Link2, label: 'Compartilhe o link com o cliente' },
  { icon: MessageSquare, label: 'O cliente comenta ou aprova' },
  { icon: Users, label: 'Revise internamente com sua equipe' },
]

export function DashboardView() {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  const [client, setClient] = useState(ALL_CLIENTS)
  const [status, setStatus] = useState<'todos' | VideoStatus>('todos')
  const [search, setSearch] = useState('')

  const { data, loading, error, refetch, setData } = useQuery<Video[]>(
    (signal) => videoService.list(undefined, signal),
    [],
  )
  // A listagem de vídeos traz o `projectId`, mas não o nome do projeto.
  // Buscamos a referência separadamente para organizar a visão principal em
  // Cliente → Projeto, sem propagar a estrutura crua da API aos cards.
  const projects = useQuery<Project[]>((signal) => projectService.list(undefined, signal), [])

  const insights = useQuery<DashboardInsights>(
    (signal) => dashboardService.insights(signal),
    [],
  )

  // Esconde versões antigas (substituídas por um reenvio na tela de revisão)
  // dos contadores e da listagem — só a mais recente de cada cadeia conta.
  const videos = (data ?? []).filter((v) => v.latestVersionId === v.id)
  const hasExamples = videos.some((v) => v.isExample)

  // `GET /videos` não devolve data do último comentário (só a contagem), então
  // o `lastCommentAt` mapeado em `mapVideo` fica sempre nulo fora do modo demo.
  // Busca a data real via `/public/videos/:link` (mesmo endpoint da tela do
  // cliente, que já devolve os comentários com `criadoEm`) só pros vídeos que
  // têm comentário — enriquece a ordenação sem precisar de mudança no backend.
  const [commentActivity, setCommentActivity] = useState<Record<string, string>>({})
  useEffect(() => {
    const targets = videos.filter((v) => v.commentsCount > 0 && v.publicLink)
    if (targets.length === 0) return
    let cancelled = false
    Promise.all(
      targets.map(async (v) => {
        try {
          const pub = await publicService.getByLink(v.publicLink!)
          const latest = pub.comments.reduce<string | null>(
            (acc, c) => (c.createdAt && (!acc || c.createdAt > acc) ? c.createdAt : acc),
            null,
          )
          return [v.id, latest] as const
        } catch {
          return [v.id, null] as const
        }
      }),
    ).then((results) => {
      if (cancelled) return
      setCommentActivity((prev) => {
        const next = { ...prev }
        for (const [id, latest] of results) if (latest) next[id] = latest
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

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

  const filtered = videos
    .filter((v) => {
      const byClient = client === ALL_CLIENTS || v.clientName === client
      const byStatus = status === 'todos' || v.status === status
      const bySearch = search.trim() === '' || v.title.toLowerCase().includes(search.trim().toLowerCase())
      return byClient && byStatus && bySearch
    })
    .sort((a, b) => byMostRecentComment(a, b, commentActivity))

  const videoGroups = useMemo(() => {
    const projectById = new Map((projects.data ?? []).map((project) => [project.id, project]))
    const clients = new Map<string, { name: string; projects: Map<string, VideoGroup> }>()

    for (const video of filtered) {
      const clientKey = video.clientName || 'sem-cliente'
      if (!clients.has(clientKey)) {
        clients.set(clientKey, { name: video.clientName || 'Sem cliente', projects: new Map() })
      }
      const clientGroup = clients.get(clientKey)!
      const project = video.projectId ? projectById.get(video.projectId) : undefined
      const projectKey = video.projectId ?? 'sem-projeto'
      if (!clientGroup.projects.has(projectKey)) {
        clientGroup.projects.set(projectKey, {
          id: projectKey,
          name: project?.name ?? 'Sem projeto',
          videos: [],
        })
      }
      clientGroup.projects.get(projectKey)!.videos.push(video)
    }

    return Array.from(clients.values()).map((clientGroup) => ({
      name: clientGroup.name,
      projects: Array.from(clientGroup.projects.values()),
    }))
  }, [filtered, projects.data])

  const pending = videos.filter((v) => v.status === 'pendente').length
  const approved = videos.filter((v) => v.status === 'aprovado').length
  const adjust = videos.filter((v) => v.status === 'ajuste').length

  // Seleção múltipla + ações em lote (aprovar/pendente/ajuste/excluir) — só os
  // ids visíveis no filtro atual entram no "selecionar todos".
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((v) => v.id)),
    )
  }

  const approvedVideos = filtered.filter((v) => v.status === 'aprovado')
  function selectApproved() {
    setSelected(new Set(approvedVideos.map((v) => v.id)))
  }

  function handleRowDeleted(id: string) {
    setData((prev) => (prev ?? []).filter((v) => v.id !== id))
    setSelected((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    insights.refetch()
  }

  async function bulkUpdateStatus(newStatus: VideoStatus) {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      await Promise.all(ids.map((id) => videoService.updateStatus(id, newStatus)))
      setData((prev) => (prev ?? []).map((v) => (ids.includes(v.id) ? { ...v, status: newStatus } : v)))
      toast.success(`${ids.length} vídeo${ids.length === 1 ? '' : 's'} atualizado${ids.length === 1 ? '' : 's'}`)
      setSelected(new Set())
      insights.refetch()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar os vídeos selecionados.')
    } finally {
      setBulkBusy(false)
    }
  }

  /** Baixa os vídeos selecionados um a um — em sequência, pra não disparar vários downloads simultâneos e o navegador bloquear. */
  async function bulkDownload() {
    const items = filtered.filter((v) => selected.has(v.id))
    if (items.length === 0) return
    setBulkBusy(true)
    let failed = 0
    try {
      for (const v of items) {
        try {
          let url = v.originalUrl ?? v.url ?? null
          if (!url && v.publicLink) {
            const resolved = (await publicService.getByLink(v.publicLink)).video
            url = resolved.originalUrl ?? resolved.url
          }
          if (!url) {
            failed++
            continue
          }
          await triggerDownload(url, `${v.title || 'video'}.mp4`)
          await new Promise((resolve) => setTimeout(resolve, 400))
        } catch {
          failed++
        }
      }
      const ok = items.length - failed
      if (ok > 0) toast.success(`${ok} vídeo${ok === 1 ? '' : 's'} baixado${ok === 1 ? '' : 's'}`)
      if (failed > 0) toast.error(`${failed} de ${items.length} vídeos não puderam ser baixados.`)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(ids.map((id) => videoService.remove(id)))
      const succeededIds = ids.filter((_, i) => results[i].status === 'fulfilled')
      const failed = ids.length - succeededIds.length
      setData((prev) => (prev ?? []).filter((v) => !succeededIds.includes(v.id)))
      setSelected(new Set())
      if (failed > 0) {
        toast.error(`${failed} de ${ids.length} vídeos não puderam ser excluídos.`)
      } else {
        toast.success(`${ids.length} vídeo${ids.length === 1 ? '' : 's'} excluído${ids.length === 1 ? '' : 's'}`)
      }
      insights.refetch()
    } finally {
      setBulkBusy(false)
    }
  }

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

      {/* Visão geral: pendentes, aprovados no mês, em ajustes, cliente mais rápido */}
      <OverviewRow
        insights={insights}
        pending={pending}
        approved={approved}
        adjust={adjust}
        loadingVideos={loading}
      />

      {/* Produção por etapa (kanban) + carga da equipe (cruza vídeo × demanda × cliente × prazo × calendário) */}
      {!loading && !error && videos.length > 0 && <StageBreakdown videos={videos} />}
      {isOwner && !loading && !error && <TeamWorkloadPanel videos={videos} />}

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

      {/* Seleção múltipla + ações em lote */}
      {!loading && !error && filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === filtered.length}
              onChange={toggleSelectAll}
              className="size-4 cursor-pointer accent-primary"
            />
            Selecionar todos
          </label>
          {approvedVideos.length > 0 && (
            <button
              type="button"
              onClick={selectApproved}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
            >
              Selecionar aprovados ({approvedVideos.length})
            </button>
          )}
          <AnimatePresence>
            {selected.size > 0 && (
              <BulkActionsBar
                count={selected.size}
                busy={bulkBusy}
                onApprove={() => bulkUpdateStatus('aprovado')}
                onPending={() => bulkUpdateStatus('pendente')}
                onAdjust={() => bulkUpdateStatus('ajuste')}
                onDownload={bulkDownload}
                onDelete={bulkDelete}
                onClear={() => setSelected(new Set())}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Video list */}
      <div className="mt-6">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
                <Skeleton className="aspect-video w-28 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
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
              title={isOwner ? 'Nenhum vídeo enviado ainda' : 'Nenhum vídeo atribuído a você ainda'}
              description={
                isOwner
                  ? 'Envie seu primeiro vídeo para gerar um link de aprovação.'
                  : 'Peça para o responsável da agência te adicionar a um projeto.'
              }
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
          ) : (
            <EmptyState
              title="Nenhum vídeo encontrado"
              description="Nenhum vídeo corresponde aos filtros selecionados."
            />
          )
        ) : (
          <OrganizedVideoList
            groups={videoGroups}
            showClientHeadings={client === ALL_CLIENTS}
            selected={selected}
            onToggleSelect={toggleSelected}
            onDeleted={handleRowDeleted}
          />
        )}
      </div>
    </div>
  )
}

/** Colunas alinhadas entre o cabeçalho e cada linha da lista compacta. */
const LIST_GRID_COLS =
  'grid-cols-[64px_minmax(0,1.4fr)_minmax(0,1fr)_auto_40px_auto_28px] sm:grid-cols-[96px_minmax(0,1.4fr)_minmax(0,1fr)_auto_40px_auto_28px]'

type VideoGroup = {
  id: string
  name: string
  videos: Video[]
}

type ClientVideoGroup = {
  name: string
  projects: VideoGroup[]
}

function OrganizedVideoList({
  groups,
  showClientHeadings,
  selected,
  onToggleSelect,
  onDeleted,
}: {
  groups: ClientVideoGroup[]
  showClientHeadings: boolean
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onDeleted: (id: string) => void
}) {
  return (
    <div className="space-y-8">
      {groups.map((clientGroup) => (
        <section key={clientGroup.name}>
          {showClientHeadings && (
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-bold tracking-tight text-foreground">{clientGroup.name}</h2>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                {clientGroup.projects.reduce((total, project) => total + project.videos.length, 0)} vídeos
              </span>
            </div>
          )}

          <div className="space-y-6">
            {clientGroup.projects.map((project) => (
              <section key={project.id} className="rounded-2xl border border-border bg-secondary/35 p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <FolderOpen className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold text-foreground">{project.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {project.videos.length} vídeo{project.videos.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  className={cn(
                    'hidden items-center gap-4 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid',
                    LIST_GRID_COLS,
                  )}
                >
                  <span>Vídeo</span>
                  <span>Arquivo</span>
                  <span>Cliente</span>
                  <span>Status</span>
                  <span className="flex justify-center"><MessageSquare className="size-3.5" /></span>
                  <span>Enviado</span>
                  <span />
                </div>
                <div className="flex flex-col gap-2.5">
                  {project.videos.map((video) => (
                    <CompactVideoRow
                      key={video.id}
                      video={video}
                      selected={selected.has(video.id)}
                      onToggleSelect={() => onToggleSelect(video.id)}
                      onDeleted={() => onDeleted(video.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const compactStatusStyles: Record<VideoStatus, string> = {
  pendente: 'bg-secondary text-muted-foreground',
  aprovado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  ajuste: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  erro: 'bg-destructive/15 text-destructive',
}

function VideoThumb({
  video: v,
  selected,
  onToggleSelect,
  sizes,
}: {
  video: Video
  selected: boolean
  onToggleSelect: () => void
  sizes: string
}) {
  return (
    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-secondary">
      {v.posterUrl ? (
        <Image src={v.posterUrl} alt="" fill className="object-cover" sizes={sizes} unoptimized />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground/60">
          <Film className="size-5" />
        </span>
      )}
      <input
        type="checkbox"
        aria-label={`Selecionar ${v.title}`}
        checked={selected}
        onChange={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-1.5 top-1.5 z-[2] size-4 cursor-pointer accent-primary"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="grid size-6 place-items-center rounded-full bg-black/45 text-white">
          <Play className="size-3 fill-white" />
        </span>
      </span>
      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-white">
        {formatDuration(v.duration)}
      </span>
    </div>
  )
}

function VideoStatusBadge({ status }: { status: VideoStatus }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        compactStatusStyles[status],
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {statusLabel[status]}
    </span>
  )
}

function CompactVideoRow({
  video: v,
  selected,
  onToggleSelect,
  onDeleted,
}: {
  video: Video
  selected: boolean
  onToggleSelect: () => void
  onDeleted: () => void
}) {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'

  return (
    <div className="group relative rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/50">
      <Link
        href={`/videos/${v.id}/revisao`}
        aria-label={`Abrir revisão interna de ${v.title}`}
        className="absolute inset-0 z-[1]"
      />

      {/* Mobile: card compacto empilhado (< sm) */}
      <div className="flex items-center gap-3 sm:hidden">
        <div className="w-16 shrink-0">
          <VideoThumb video={v} selected={selected} onToggleSelect={onToggleSelect} sizes="64px" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground" title={v.title}>
            {v.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={v.clientName}>
            {v.clientName}
          </p>
          <div className="mt-1.5">
            <VideoStatusBadge status={v.status} />
          </div>
        </div>
        <div className="relative z-[2] shrink-0">
          <RowActionsMenu video={v} isOwner={isOwner} onDeleted={onDeleted} />
        </div>
      </div>

      {/* Tablet/desktop: colunas alinhadas ao cabeçalho (>= sm) */}
      <div className={cn('hidden items-center gap-4 sm:grid', LIST_GRID_COLS)}>
        <VideoThumb video={v} selected={selected} onToggleSelect={onToggleSelect} sizes="96px" />

        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground" title={v.title}>
            {v.title}
          </h3>
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              v.commentsCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {v.commentsCount} comentário{v.commentsCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="min-w-0 truncate text-sm font-medium text-foreground" title={v.clientName}>
          {v.clientName}
        </div>

        <div>
          <VideoStatusBadge status={v.status} />
        </div>

        <div
          className={cn(
            'flex items-center justify-center gap-1 text-sm',
            v.commentsCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          <MessageSquare className="size-3.5" fill={v.commentsCount > 0 ? 'currentColor' : 'none'} />
          {v.commentsCount}
        </div>

        <div className="truncate text-sm text-muted-foreground">{formatSentAtCompact(v.createdAt)}</div>

        <div className="relative z-[2] flex justify-end">
          <RowActionsMenu video={v} isOwner={isOwner} onDeleted={onDeleted} />
        </div>
      </div>
    </div>
  )
}

function RowActionsMenu({
  video: v,
  isOwner,
  onDeleted,
}: {
  video: Video
  isOwner: boolean
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const publicHref = v.publicLink ? `/v/${v.publicLink}` : null

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmingDelete(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handleDelete() {
    setDeleting(true)
    try {
      await videoService.remove(v.id)
      onDeleted()
      toast.success('Vídeo excluído')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir o vídeo.')
    } finally {
      setDeleting(false)
      setOpen(false)
      setConfirmingDelete(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Mais ações para ${v.title}`}
        className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreVertical className="size-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: -4 }}
            animate={{ y: 0 }}
            exit={{ y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-2xl"
          >
            {confirmingDelete ? (
              <div className="p-1.5">
                <p className="px-1 pb-2 text-xs text-muted-foreground">Excluir este vídeo?</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive px-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirmar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleting}
                    className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Link
                  href={`/videos/${v.id}/revisao`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  <Lock className="size-3.5 text-muted-foreground" />
                  Revisão interna
                </Link>
                {isOwner && (
                  <Link
                    href={`/videos/${v.id}/canal-cliente`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <Users className="size-3.5 text-muted-foreground" />
                    Canal do cliente
                  </Link>
                )}
                {publicHref && (
                  <Link
                    href={publicHref}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                    Link do cliente
                  </Link>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                    Excluir vídeo
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function BulkActionsBar({
  count,
  busy,
  onApprove,
  onPending,
  onAdjust,
  onDownload,
  onDelete,
  onClear,
}: {
  count: number
  busy: boolean
  onApprove: () => void
  onPending: () => void
  onAdjust: () => void
  onDownload: () => void
  onDelete: () => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmingDelete(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function run(action: () => void) {
    action()
    setOpen(false)
    setConfirmingDelete(false)
  }

  return (
    <motion.div
      initial={{ y: -4 }}
      animate={{ y: 0 }}
      exit={{ y: -4 }}
      transition={{ duration: 0.15 }}
      className="inline-flex items-center gap-2 rounded-lg bg-secondary py-1.5 pl-3 pr-1.5"
    >
      <span className="text-sm font-medium text-foreground">
        {count} selecionado{count === 1 ? '' : 's'}
      </span>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={busy}
          aria-label="Ações em lote"
          className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreVertical className="size-4" />}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              exit={{ y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-2xl"
            >
              {confirmingDelete ? (
                <div className="p-1.5">
                  <p className="px-1 pb-2 text-xs text-muted-foreground">
                    Excluir {count} vídeo{count === 1 ? '' : 's'}?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => run(onDelete)}
                      className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-destructive px-2 text-xs font-medium text-white hover:opacity-90"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => run(onApprove)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <CircleCheckBig className="size-3.5 text-emerald-500" />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => run(onAdjust)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <Pencil className="size-3.5 text-amber-500" />
                    Marcar como ajuste
                  </button>
                  <button
                    type="button"
                    onClick={() => run(onPending)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <AlarmClock className="size-3.5 text-muted-foreground" />
                    Marcar como pendente
                  </button>
                  <button
                    type="button"
                    onClick={() => run(onDownload)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <Download className="size-3.5 text-muted-foreground" />
                    Baixar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5" />
                    Excluir
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        aria-label="Limpar seleção"
        className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
      >
        <CircleX className="size-4" />
      </button>
    </motion.div>
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
      initial={{ y: -6 }}
      animate={{ y: 0 }}
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
  const approvedThisMonth = data?.approvedThisMonth ?? approved
  const fastestClient = data?.fastestClient ?? null
  const hasPendingAlert = pending > 0

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
            {pending}
          </p>
          <p
            className={cn(
              'mt-1 text-xs',
              hasPendingAlert ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {hasPendingAlert ? 'pendentes · aguardando retorno' : 'pendentes · tudo em dia'}
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

/** Distribuição dos vídeos pelas etapas do kanban (`/kanban`) — todo mundo vê, não só o owner. */
function StageBreakdown({ videos }: { videos: Video[] }) {
  const counts = useMemo(() => {
    const map = new Map<ProductionStage, number>(STAGES.map((s) => [s, 0]))
    for (const v of videos) map.set(v.productionStage, (map.get(v.productionStage) ?? 0) + 1)
    return map
  }, [videos])
  const total = videos.length

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <LayoutGrid className="size-4 text-muted-foreground" /> Produção por etapa
        </h2>
        <Link href="/kanban" className="text-xs font-medium text-foreground hover:underline">
          Ver kanban
        </Link>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {STAGES.map((stage) => {
          const count = counts.get(stage) ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={stage} className={cn('flex items-center gap-3', count === 0 && 'opacity-40')}>
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground sm:w-40">
                {productionStageLabel[stage]}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className={cn('h-full rounded-full', STAGE_COLOR[stage])} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6 shrink-0 text-right text-xs font-medium text-foreground">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Cruza vídeo × demanda × cliente × prazo × calendário por responsável —
 * sinaliza sobrecarga (itens ativos + atrasados) e o que a pessoa tem
 * agendado nos próximos 7 dias. `Video.editorId`, `Demand.responsibleId`,
 * `Client.responsibleId` e `CalendarActivity.crew[].userId` apontam pro mesmo
 * `TeamMember.id`, então dá pra juntar tudo sem endpoint novo.
 */
function TeamWorkloadPanel({ videos }: { videos: Video[] }) {
  const members = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const events = useQuery<CalendarActivity[]>((signal) => calendarService.list(signal), [])
  const demands = useQuery<Demand[]>((signal) => demandService.list(signal), [])
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])

  const rows = useMemo(() => {
    const now = Date.now()
    const in7d = now + 7 * 24 * 60 * 60 * 1000
    return (members.data ?? [])
      // Exclui só convites ainda não aceitos (sem nome, não têm como ter
      // trabalho atribuído) — inclui `suspended` de propósito: alguém
      // suspenso com vídeo atrasado nas costas é o gargalo mais importante
      // de mostrar aqui, não algo pra esconder.
      .filter((m) => m.name)
      .map((m) => {
        const assignedVideos = videos.filter((v) => v.editorId === m.id)
        const activeVideos = assignedVideos.filter((v) => v.status !== 'aprovado' && v.productionStage !== 'entregue')
        const assignedDemands = (demands.data ?? []).filter((d) => d.responsibleId === m.id)
        const activeDemands = assignedDemands.filter((d) => d.productionStage !== 'entregue')
        const overdue = [...activeVideos, ...activeDemands].filter(
          (i) => i.deadline && new Date(i.deadline).getTime() < now,
        )
        const upcoming = (events.data ?? []).filter((ev) => {
          const t = new Date(ev.startAt).getTime()
          return t >= now && t <= in7d && ev.crew.some((c) => c.userId === m.id)
        })
        const clientsCount = (clients.data ?? []).filter((c) => c.responsibleId === m.id).length
        return {
          member: m,
          activeCount: activeVideos.length + activeDemands.length,
          overdueCount: overdue.length,
          upcomingCount: upcoming.length,
          clientsCount,
        }
      })
      .sort((a, b) => b.overdueCount - a.overdueCount || b.activeCount - a.activeCount)
  }, [members.data, events.data, demands.data, clients.data, videos])

  const unassignedCount =
    videos.filter((v) => !v.editorId && v.status !== 'aprovado' && v.productionStage !== 'entregue').length +
    (demands.data ?? []).filter((d) => !d.responsibleId && d.productionStage !== 'entregue').length

  if (members.loading) return <Skeleton className="mt-6 h-40 w-full rounded-xl" />
  if (rows.length === 0) return null

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <UserCog className="size-4 text-muted-foreground" /> Carga da equipe
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Vídeos e demandas ativos, clientes atribuídos e gravações dos próximos 7 dias, por responsável.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {rows.map(({ member, activeCount, overdueCount, upcomingCount, clientsCount }) => {
          const overdue = overdueCount > 0
          // Atrasado nunca fica ocioso (só conta como atrasado se ainda ativo), então os dois nunca coincidem.
          const idle = activeCount === 0 && !overdue
          return (
            <div
              key={member.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2',
                overdue ? 'bg-destructive/10' : 'bg-secondary/50',
                idle && 'opacity-50',
              )}
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {member.name || member.email}
              </span>
              <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {activeCount} ativo{activeCount === 1 ? '' : 's'}
                </span>
                {clientsCount > 0 && (
                  <span>
                    {clientsCount} cliente{clientsCount === 1 ? '' : 's'}
                  </span>
                )}
                {overdue && (
                  <span className="inline-flex items-center gap-1 font-medium text-destructive">
                    <AlertTriangle className="size-3" /> {overdueCount} atrasado{overdueCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" /> {upcomingCount} próx. 7d
                </span>
              </div>
            </div>
          )
        })}
        {unassignedCount > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <span>Sem responsável</span>
            <span>
              {unassignedCount} ativo{unassignedCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
