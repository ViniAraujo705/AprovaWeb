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
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { dashboardService, publicService, sampleDataService, videoService } from '@/lib/services'
import { statusLabel, type DashboardInsights, type Video, type VideoStatus } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { formatDuration, formatSentAtCompact } from '@/lib/format'
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
  const [client, setClient] = useState(ALL_CLIENTS)
  const [status, setStatus] = useState<'todos' | VideoStatus>('todos')
  const [search, setSearch] = useState('')

  const { data, loading, error, refetch, setData } = useQuery<Video[]>(
    (signal) => videoService.list(undefined, signal),
    [],
  )

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
          <AnimatePresence>
            {selected.size > 0 && (
              <BulkActionsBar
                count={selected.size}
                busy={bulkBusy}
                onApprove={() => bulkUpdateStatus('aprovado')}
                onPending={() => bulkUpdateStatus('pendente')}
                onAdjust={() => bulkUpdateStatus('ajuste')}
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
          <CompactVideoList
            videos={filtered}
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

function CompactVideoList({
  videos,
  selected,
  onToggleSelect,
  onDeleted,
}: {
  videos: Video[]
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onDeleted: (id: string) => void
}) {
  return (
    <div>
      <div
        className={cn(
          'hidden items-center gap-4 px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid',
          LIST_GRID_COLS,
        )}
      >
        <span>Vídeo</span>
        <span>Arquivo</span>
        <span>Cliente</span>
        <span>Status</span>
        <span className="flex justify-center">
          <MessageSquare className="size-3.5" />
        </span>
        <span>Enviado</span>
        <span />
      </div>
      <div className="flex flex-col gap-2.5">
        {videos.map((v) => (
          <CompactVideoRow
            key={v.id}
            video={v}
            selected={selected.has(v.id)}
            onToggleSelect={() => onToggleSelect(v.id)}
            onDeleted={() => onDeleted(v.id)}
          />
        ))}
      </div>
    </div>
  )
}

const compactStatusStyles: Record<VideoStatus, string> = {
  pendente: 'bg-secondary text-foreground',
  aprovado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  ajuste: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  erro: 'bg-destructive/15 text-destructive',
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
    <div
      className={cn(
        'group relative grid items-center gap-4 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/50',
        LIST_GRID_COLS,
      )}
    >
      <Link
        href={`/videos/${v.id}/revisao`}
        aria-label={`Abrir revisão interna de ${v.title}`}
        className="absolute inset-0 z-[1]"
      />

      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-secondary">
        {v.posterUrl ? (
          <Image
            src={v.posterUrl}
            alt=""
            fill
            className="object-cover"
            sizes="96px"
            unoptimized
          />
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
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
            compactStatusStyles[v.status],
          )}
        >
          <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
          {statusLabel[v.status]}
        </span>
      </div>

      <div
        className={cn(
          'hidden items-center justify-center gap-1 text-sm sm:flex',
          v.commentsCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        <MessageSquare className="size-3.5" fill={v.commentsCount > 0 ? 'currentColor' : 'none'} />
        {v.commentsCount}
      </div>

      <div className="hidden truncate text-sm text-muted-foreground sm:block">
        {formatSentAtCompact(v.createdAt)}
      </div>

      <div className="relative z-[2] flex justify-end">
        <RowActionsMenu video={v} isOwner={isOwner} onDeleted={onDeleted} />
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
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
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
  onDelete,
  onClear,
}: {
  count: number
  busy: boolean
  onApprove: () => void
  onPending: () => void
  onAdjust: () => void
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
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
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
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
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
