'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Search,
  Play,
  Film,
  FolderOpen,
  Megaphone,
  Camera,
  ListChecks,
  X,
  Check,
  RotateCcw,
  Trash2,
  MessageSquare,
  Lock,
  Users,
  ExternalLink,
  Loader2,
  Tag,
  Pencil,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { videoService, teamService, demandService, clientService } from '@/lib/services'
import {
  productionStageLabel,
  type Client,
  type Demand,
  type DemandKind,
  type ProductionStage,
  type TeamMember,
  type Video,
} from '@/lib/types'
import { ClientAvatar } from '@/components/client-avatar'
import { DeadlineBadge, DeadlineField } from '@/components/deadline-badge'
import { DateField } from '@/components/date-field'
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
const ALL_KINDS = 'Todos os tipos'

/**
 * Ordem/colunas colapsadas/labels/colaboradores extras ainda não existem na
 * API (só `productionStage` e um único `responsibleId`/`editorId`), então
 * esse recorte "estilo Trello" vive só no navegador via localStorage — não
 * sincroniza entre dispositivos nem aparece pra outros membros da equipe
 * até o backend ganhar campos próprios pra isso.
 */
const LS_ORDER_KEY = 'aprova:kanban:card-order'
const LS_COLLAPSED_KEY = 'aprova:kanban:collapsed-columns'
const LS_LABELS_KEY = 'aprova:kanban:labels'
const LS_CARD_LABELS_KEY = 'aprova:kanban:card-labels'
const LS_COLLABORATORS_KEY = 'aprova:kanban:card-collaborators'

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage indisponível/cheio — recorte local, não crítico
  }
}

const LABEL_COLORS = [
  { id: 'red', className: 'bg-red-500' },
  { id: 'orange', className: 'bg-orange-500' },
  { id: 'amber', className: 'bg-amber-400' },
  { id: 'emerald', className: 'bg-emerald-500' },
  { id: 'sky', className: 'bg-sky-500' },
  { id: 'violet', className: 'bg-violet-500' },
  { id: 'pink', className: 'bg-pink-500' },
] as const

const LABEL_COLOR_CLASS: Record<string, string> = Object.fromEntries(
  LABEL_COLORS.map((c) => [c.id, c.className]),
)

interface BoardLabel {
  id: string
  text: string
  color: string
}

const DEFAULT_LABELS: BoardLabel[] = [
  { id: 'urgente', text: 'Urgente', color: 'red' },
  { id: 'revisao', text: 'Revisão', color: 'amber' },
  { id: 'vip', text: 'Cliente VIP', color: 'violet' },
]

/** `video` vem de `GET /videos`; os demais tipos vêm de `GET /demandas` (ver `demandService`). */
type CardKind = 'video' | DemandKind

const DEMAND_KINDS: DemandKind[] = ['projeto', 'campanha', 'gravacao', 'demanda']

const KIND_META: Record<CardKind, { label: string; icon: LucideIcon }> = {
  video: { label: 'Vídeo', icon: Film },
  projeto: { label: 'Projeto', icon: FolderOpen },
  campanha: { label: 'Campanha', icon: Megaphone },
  gravacao: { label: 'Gravação', icon: Camera },
  demanda: { label: 'Demanda', icon: ListChecks },
}

/** Entrada do formulário do `DemandModal` — id presente só ao editar uma demanda existente. */
interface DemandInput {
  id?: string
  title: string
  kind: DemandKind
  clientId: string | null
  responsibleId: string | null
  deadline: string | null
  stage: ProductionStage
}

/** Formato unificado que os cards/coluna consomem, seja o vídeo real ou uma demanda. */
interface BoardItem {
  id: string
  kind: CardKind
  title: string
  clientName: string
  responsibleName: string | null
  responsibleSeed: string | null
  deadline: string | null
  stage: ProductionStage
  commentsCount: number
  posterUrl: string | null
  duration: number
}

function videoToItem(v: Video, responsibleName: string | null): BoardItem {
  return {
    id: v.id,
    kind: 'video',
    title: v.title,
    clientName: v.clientName,
    responsibleName,
    responsibleSeed: v.editorId ?? responsibleName,
    deadline: v.deadline,
    stage: v.productionStage,
    commentsCount: v.commentsCount,
    posterUrl: v.posterUrl,
    duration: v.duration,
  }
}

function sortByOrder(colItems: BoardItem[], orderList: string[] | undefined): BoardItem[] {
  if (!orderList || orderList.length === 0) return colItems
  const idx = new Map(orderList.map((id, i) => [id, i]))
  return [...colItems].sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER
    const bi = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER
    return ai - bi
  })
}

function demandToItem(d: Demand, responsibleName: string | null, clientName: string): BoardItem {
  return {
    id: d.id,
    kind: d.kind,
    title: d.title,
    clientName,
    responsibleName,
    responsibleSeed: d.responsibleId ?? responsibleName,
    deadline: d.deadline,
    stage: d.productionStage,
    commentsCount: 0,
    posterUrl: null,
    duration: 0,
  }
}

export function KanbanView() {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'

  const { data, loading, error, refetch, setData } = useQuery<Video[]>(
    (signal) => videoService.list(undefined, signal),
    [],
  )
  const team = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const demandsQuery = useQuery<Demand[]>((signal) => demandService.list(signal), [])

  // Mesma regra do dashboard: só a versão mais recente de cada vídeo aparece no board.
  const videos = (data ?? []).filter((v) => v.latestVersionId === v.id)
  const demands = demandsQuery.data ?? []

  const [search, setSearch] = useState('')
  const [client, setClient] = useState(ALL_CLIENTS)
  const [kindFilter, setKindFilter] = useState<CardKind | typeof ALL_KINDS>(ALL_KINDS)
  const [dragOverColumn, setDragOverColumn] = useState<ProductionStage | null>(null)
  const [activeItem, setActiveItem] = useState<{ kind: 'video' | 'demand'; id: string } | null>(null)
  const [creatingStage, setCreatingStage] = useState<ProductionStage | null>(null)

  // Recorte "estilo Trello" (colunas colapsadas, ordem manual, labels,
  // colaboradores extras) sem campo correspondente na API ainda — vive só
  // no localStorage deste navegador. Carregado após o mount pra não gerar
  // mismatch de hidratação SSR/cliente.
  const [collapsedStages, setCollapsedStages] = useState<Set<ProductionStage>>(new Set())
  const [order, setOrder] = useState<Partial<Record<ProductionStage, string[]>>>({})
  const [labels, setLabels] = useState<BoardLabel[]>(DEFAULT_LABELS)
  const [cardLabels, setCardLabels] = useState<Record<string, string[]>>({})
  const [collaborators, setCollaborators] = useState<Record<string, string[]>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [managingLabels, setManagingLabels] = useState(false)
  const [localStateLoaded, setLocalStateLoaded] = useState(false)

  useEffect(() => {
    setCollapsedStages(new Set(loadJSON<ProductionStage[]>(LS_COLLAPSED_KEY, [])))
    setOrder(loadJSON(LS_ORDER_KEY, {}))
    setLabels(loadJSON(LS_LABELS_KEY, DEFAULT_LABELS))
    setCardLabels(loadJSON(LS_CARD_LABELS_KEY, {}))
    setCollaborators(loadJSON(LS_COLLABORATORS_KEY, {}))
    setLocalStateLoaded(true)
  }, [])

  useEffect(() => {
    if (localStateLoaded) saveJSON(LS_COLLAPSED_KEY, Array.from(collapsedStages))
  }, [collapsedStages, localStateLoaded])
  useEffect(() => {
    if (localStateLoaded) saveJSON(LS_ORDER_KEY, order)
  }, [order, localStateLoaded])
  useEffect(() => {
    if (localStateLoaded) saveJSON(LS_LABELS_KEY, labels)
  }, [labels, localStateLoaded])
  useEffect(() => {
    if (localStateLoaded) saveJSON(LS_CARD_LABELS_KEY, cardLabels)
  }, [cardLabels, localStateLoaded])
  useEffect(() => {
    if (localStateLoaded) saveJSON(LS_COLLABORATORS_KEY, collaborators)
  }, [collaborators, localStateLoaded])

  function toggleCollapsed(stage: ProductionStage) {
    setCollapsedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  function reorderPreview(stage: ProductionStage, currentIds: string[], draggedId: string, overId: string, before: boolean) {
    if (draggedId === overId) return
    setOrder((prev) => {
      const base = prev[stage] && prev[stage]!.length > 0 ? prev[stage]! : currentIds
      const withoutDragged = base.filter((id) => id !== draggedId)
      const overIndex = withoutDragged.indexOf(overId)
      if (overIndex === -1) return prev
      const insertAt = before ? overIndex : overIndex + 1
      const next = [...withoutDragged.slice(0, insertAt), draggedId, ...withoutDragged.slice(insertAt)]
      const prevForStage = prev[stage]
      if (prevForStage && prevForStage.length === next.length && prevForStage.every((id, i) => id === next[i])) {
        return prev
      }
      return { ...prev, [stage]: next }
    })
  }

  function toggleCardLabel(itemId: string, labelId: string) {
    setCardLabels((prev) => {
      const current = prev[itemId] ?? []
      const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]
      return { ...prev, [itemId]: next }
    })
  }

  function toggleCollaborator(itemId: string, memberId: string) {
    setCollaborators((prev) => {
      const current = prev[itemId] ?? []
      const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]
      return { ...prev, [itemId]: next }
    })
  }

  // Auto-scroll horizontal do quadro: arrastar um card até perto da borda
  // esquerda/direita rola o quadro pra revelar as colunas seguintes (sem
  // isso, colunas depois de "Aguardando aprovação" ficam inalcançáveis
  // durante o drag num quadro mais largo que a tela).
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const scrollDirRef = useRef<0 | -1 | 1>(0)
  const scrollRafRef = useRef<number | null>(null)
  const BOARD_SCROLL_EDGE = 80
  const BOARD_SCROLL_SPEED = 14

  function stepBoardAutoScroll() {
    const el = boardScrollRef.current
    if (!el || scrollDirRef.current === 0) {
      scrollRafRef.current = null
      return
    }
    el.scrollLeft += scrollDirRef.current * BOARD_SCROLL_SPEED
    scrollRafRef.current = requestAnimationFrame(stepBoardAutoScroll)
  }

  function handleBoardDragOver(e: React.DragEvent<HTMLDivElement>) {
    const el = boardScrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let dir: 0 | -1 | 1 = 0
    if (e.clientX < rect.left + BOARD_SCROLL_EDGE) dir = -1
    else if (e.clientX > rect.right - BOARD_SCROLL_EDGE) dir = 1
    scrollDirRef.current = dir
    if (dir !== 0 && scrollRafRef.current === null) {
      scrollRafRef.current = requestAnimationFrame(stepBoardAutoScroll)
    }
  }

  function stopBoardAutoScroll() {
    scrollDirRef.current = 0
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
  }

  useEffect(() => stopBoardAutoScroll, [])

  const responsibleName = (id: string | null) =>
    id ? team.data?.find((m) => m.id === id)?.name ?? null : null
  const clientNameById = (id: string | null) =>
    id ? clients.data?.find((c) => c.id === id)?.name ?? '' : ''

  const items: BoardItem[] = useMemo(() => {
    const videoItems = videos.map((v) => videoToItem(v, responsibleName(v.editorId)))
    const demandItems = demands.map((d) =>
      demandToItem(d, responsibleName(d.responsibleId), clientNameById(d.clientId)),
    )
    return [...videoItems, ...demandItems]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, demands, team.data, clients.data])

  const clientNames = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.clientName && set.add(i.clientName))
    return [ALL_CLIENTS, ...Array.from(set).sort()]
  }, [items])

  const filtered = items.filter((i) => {
    const byClient = client === ALL_CLIENTS || i.clientName === client
    const byKind = kindFilter === ALL_KINDS || i.kind === kindFilter
    const bySearch = search.trim() === '' || i.title.toLowerCase().includes(search.trim().toLowerCase())
    return byClient && byKind && bySearch
  })

  const counts = {
    aguardando_aprovacao: items.filter((i) => i.stage === 'aguardando_aprovacao').length,
    ajustes: items.filter((i) => i.stage === 'ajustes').length,
    entregue: items.filter((i) => i.stage === 'entregue').length,
  }

  const boardLoading = loading || demandsQuery.loading
  const boardError = error || demandsQuery.error
  const retryBoard = () => {
    refetch()
    demandsQuery.refetch()
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

  async function moveDemand(id: string, stage: ProductionStage) {
    const previous = demands.find((d) => d.id === id)?.productionStage
    if (!previous || previous === stage) return
    demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, productionStage: stage } : d)))
    try {
      await demandService.updateStage(id, stage)
    } catch (err) {
      demandsQuery.setData((prev) =>
        (prev ?? []).map((d) => (d.id === id ? { ...d, productionStage: previous } : d)),
      )
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível mover a demanda.')
    }
  }

  function moveItem(item: BoardItem, stage: ProductionStage) {
    if (item.kind === 'video') moveVideo(item.id, stage)
    else moveDemand(item.id, stage)
  }

  async function saveDemand(input: DemandInput) {
    try {
      const payload = {
        title: input.title,
        kind: input.kind,
        clientId: input.clientId,
        responsibleId: input.responsibleId,
        deadline: input.deadline,
      }
      let saved: Demand
      if (input.id) {
        saved = await demandService.update(input.id, payload)
        if (saved.productionStage !== input.stage) saved = await demandService.updateStage(input.id, input.stage)
        const finalSaved = saved
        demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === finalSaved.id ? finalSaved : d)))
      } else {
        saved = await demandService.create(payload)
        if (saved.productionStage !== input.stage) saved = await demandService.updateStage(saved.id, input.stage)
        const finalSaved = saved
        demandsQuery.setData((prev) => [...(prev ?? []), finalSaved])
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar a demanda.')
    }
  }

  async function deleteDemand(id: string) {
    const previous = demands
    demandsQuery.setData((prev) => (prev ?? []).filter((d) => d.id !== id))
    try {
      await demandService.remove(id)
    } catch (err) {
      demandsQuery.setData(previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir a demanda.')
    }
  }

  const activeVideo = activeItem?.kind === 'video' ? videos.find((v) => v.id === activeItem.id) ?? null : null
  const activeDemand = activeItem?.kind === 'demand' ? demands.find((d) => d.id === activeItem.id) ?? null : null

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">KANBAN</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Do planejamento à entrega, tudo num lugar só. Arraste os cards entre as etapas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/upload"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
          >
            <Plus className="size-4" />
            Enviar vídeo
          </Link>
          <button
            type="button"
            onClick={() => setCreatingStage('planejado')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-5" />
            NOVA DEMANDA
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryCard
          dot="bg-amber-500"
          label="Aguardando aprovação"
          value={counts.aguardando_aprovacao}
          hint="depende do cliente"
          loading={boardLoading}
        />
        <SummaryCard dot="bg-orange-500" label="Em ajustes" value={counts.ajustes} hint="voltou pra equipe" loading={boardLoading} />
        <SummaryCard dot="bg-foreground" label="Entregues" value={counts.entregue} hint="ciclo completo" loading={boardLoading} />
        <SummaryCard dot="bg-muted-foreground" label="Total no quadro" value={items.length} hint="todas as etapas" loading={boardLoading} />
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
              placeholder="Buscar..."
              className="min-h-11 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary sm:w-52"
            />
          </div>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as CardKind | typeof ALL_KINDS)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value={ALL_KINDS}>{ALL_KINDS}</option>
            {(Object.keys(KIND_META) as CardKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
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
          <button
            type="button"
            onClick={() => setManagingLabels(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/50"
          >
            <Tag className="size-4" />
            Labels
          </button>
        </div>
      </div>

      {boardLoading ? (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <div key={col.stage} className="flex w-72 shrink-0 flex-col gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      ) : boardError ? (
        <div className="mt-4">
          <ErrorState message={boardError} onRetry={retryBoard} />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Film className="size-7" />}
            title="Nada no quadro ainda"
            description="Envie um vídeo ou crie uma demanda pra ver o quadro em ação."
            action={
              <button
                type="button"
                onClick={() => setCreatingStage('planejado')}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" /> Nova demanda
              </button>
            }
          />
        </div>
      ) : (
        <div
          ref={boardScrollRef}
          onDragOver={handleBoardDragOver}
          onDragEnd={stopBoardAutoScroll}
          onDrop={stopBoardAutoScroll}
          className="mt-4 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
        >
          {COLUMNS.map((col) => {
            const columnItems = sortByOrder(filtered.filter((i) => i.stage === col.stage), order[col.stage])
            const isCollapsed = collapsedStages.has(col.stage)

            const handleColumnDragOver = (e: React.DragEvent<HTMLElement>) => {
              e.preventDefault()
              setDragOverColumn(col.stage)
            }
            const handleColumnDrop = (e: React.DragEvent<HTMLElement>) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              const item = items.find((i) => i.id === id)
              if (item) moveItem(item, col.stage)
              setDragOverColumn(null)
              setDraggingId(null)
            }

            if (isCollapsed) {
              return (
                <button
                  key={col.stage}
                  type="button"
                  onClick={() => toggleCollapsed(col.stage)}
                  onDragOver={handleColumnDragOver}
                  onDragLeave={() => setDragOverColumn((prev) => (prev === col.stage ? null : prev))}
                  onDrop={handleColumnDrop}
                  title={`Expandir ${productionStageLabel[col.stage]}`}
                  className={cn(
                    'flex w-11 shrink-0 flex-col items-center gap-2 rounded-2xl border border-transparent bg-card py-3 transition-colors hover:border-primary/50',
                    dragOverColumn === col.stage && 'border-primary/40 bg-primary/5',
                  )}
                >
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className={cn('size-2 shrink-0 rounded-full', col.dot)} aria-hidden="true" />
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-foreground">
                    {columnItems.length}
                  </span>
                  <span className="mt-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-foreground [writing-mode:vertical-rl]">
                    {productionStageLabel[col.stage]}
                  </span>
                </button>
              )
            }

            return (
              <div
                key={col.stage}
                onDragOver={handleColumnDragOver}
                onDragLeave={() => setDragOverColumn((prev) => (prev === col.stage ? null : prev))}
                onDrop={handleColumnDrop}
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
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-foreground">
                    {columnItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(col.stage)}
                    title="Recolher coluna"
                    className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                </div>

                <div className="flex max-h-[60vh] min-h-24 flex-col gap-3 overflow-y-auto pb-1">
                  {columnItems.map((item) => (
                    <BoardCard
                      key={item.id}
                      item={item}
                      itemLabels={labels.filter((l) => (cardLabels[item.id] ?? []).includes(l.id))}
                      collaboratorNames={(collaborators[item.id] ?? [])
                        .map((id) => team.data?.find((m) => m.id === id))
                        .filter((m): m is TeamMember => Boolean(m && m.id !== item.responsibleSeed))}
                      onOpen={() =>
                        setActiveItem({ kind: item.kind === 'video' ? 'video' : 'demand', id: item.id })
                      }
                      onDragStart={() => setDraggingId(item.id)}
                      onDragEndCard={() => setDraggingId(null)}
                      onCardDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDragOverColumn(col.stage)
                        if (!draggingId || draggingId === item.id) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const before = e.clientY < rect.top + rect.height / 2
                        reorderPreview(
                          col.stage,
                          columnItems.map((i) => i.id),
                          draggingId,
                          item.id,
                          before,
                        )
                      }}
                    />
                  ))}
                  {columnItems.length === 0 && (
                    <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                      Arraste um card pra cá
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCreatingStage(col.stage)}
                  className="flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  Adicionar
                </button>
              </div>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {activeVideo && (
          <VideoDetailModal
            video={activeVideo}
            editorName={responsibleName(activeVideo.editorId)}
            isOwner={isOwner}
            labels={labels}
            activeLabelIds={cardLabels[activeVideo.id] ?? []}
            onToggleLabel={(labelId) => toggleCardLabel(activeVideo.id, labelId)}
            onManageLabels={() => setManagingLabels(true)}
            teamMembers={team.data ?? []}
            collaboratorIds={(collaborators[activeVideo.id] ?? []).filter((id) => id !== activeVideo.editorId)}
            onToggleCollaborator={(memberId) => toggleCollaborator(activeVideo.id, memberId)}
            onClose={() => setActiveItem(null)}
            onUpdateStage={(stage) => moveVideo(activeVideo.id, stage)}
            onDeadlineUpdated={(deadline) =>
              setData((prev) => (prev ?? []).map((v) => (v.id === activeVideo.id ? { ...v, deadline } : v)))
            }
          />
        )}
        {activeDemand && (
          <DemandModal
            demand={activeDemand}
            initialStage={activeDemand.productionStage}
            teamMembers={team.data ?? []}
            clients={clients.data ?? []}
            labels={labels}
            activeLabelIds={cardLabels[activeDemand.id] ?? []}
            onToggleLabel={(labelId) => toggleCardLabel(activeDemand.id, labelId)}
            onManageLabels={() => setManagingLabels(true)}
            collaboratorIds={(collaborators[activeDemand.id] ?? []).filter(
              (id) => id !== activeDemand.responsibleId,
            )}
            onToggleCollaborator={(memberId) => toggleCollaborator(activeDemand.id, memberId)}
            onClose={() => setActiveItem(null)}
            onSave={saveDemand}
            onDelete={(id) => {
              deleteDemand(id)
              setActiveItem(null)
            }}
          />
        )}
        {creatingStage && (
          <DemandModal
            demand={null}
            initialStage={creatingStage}
            teamMembers={team.data ?? []}
            clients={clients.data ?? []}
            labels={labels}
            activeLabelIds={[]}
            onToggleLabel={() => {}}
            onManageLabels={() => setManagingLabels(true)}
            collaboratorIds={[]}
            onToggleCollaborator={() => {}}
            onClose={() => setCreatingStage(null)}
            onSave={saveDemand}
            onDelete={() => setCreatingStage(null)}
          />
        )}
        {managingLabels && <LabelManagerModal labels={labels} onChange={setLabels} onClose={() => setManagingLabels(false)} />}
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

function CardVisual({
  kind,
  posterUrl,
  duration,
  className,
}: {
  kind: CardKind
  posterUrl: string | null
  duration: number
  className?: string
}) {
  const KindIcon = KIND_META[kind].icon
  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg bg-secondary', className)}>
      {posterUrl ? (
        <Image src={posterUrl} alt="" fill className="object-cover" sizes="288px" unoptimized />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground/60">
          <KindIcon className="size-6" />
        </span>
      )}
      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
        <KindIcon className="size-3" />
        {KIND_META[kind].label}
      </span>
      {kind === 'video' && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="grid size-9 place-items-center rounded-full bg-black/30 text-white backdrop-blur-sm">
            <Play className="size-4 fill-white" />
          </span>
        </span>
      )}
      {duration > 0 && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  )
}

function BoardCard({
  item,
  itemLabels,
  collaboratorNames,
  onOpen,
  onDragStart,
  onDragEndCard,
  onCardDragOver,
}: {
  item: BoardItem
  itemLabels: BoardLabel[]
  collaboratorNames: TeamMember[]
  onOpen: () => void
  onDragStart: () => void
  onDragEndCard: () => void
  onCardDragOver: (e: React.DragEvent<HTMLButtonElement>) => void
}) {
  const extraPeople = collaboratorNames.map((m) => ({ name: m.name, seed: m.id }))
  const people = item.responsibleName
    ? [{ name: item.responsibleName, seed: item.responsibleSeed ?? item.responsibleName }, ...extraPeople]
    : extraPeople
  const KindIcon = KIND_META[item.kind].icon

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEndCard}
      onDragOver={onCardDragOver}
      onClick={onOpen}
      className="group flex cursor-grab flex-col rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <KindIcon className="size-3" />
        {KIND_META[item.kind].label}
        {item.kind === 'video' && item.duration > 0 && <span>· {formatDuration(item.duration)}</span>}
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground" title={item.title}>
          {item.title}
        </h4>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            stageBadgeStyles[item.stage],
          )}
        >
          {productionStageLabel[item.stage]}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.clientName || 'Sem cliente'}</p>

      {itemLabels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {itemLabels.map((l) => (
            <span
              key={l.id}
              title={l.text}
              className={cn('h-1.5 w-8 rounded-full', LABEL_COLOR_CLASS[l.color] ?? 'bg-secondary')}
            />
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        {people.length > 0 ? (
          <div className="flex min-w-0 items-center">
            <div className="flex shrink-0 items-center -space-x-2">
              {people.slice(0, 3).map((p, i) => (
                <ClientAvatar key={i} name={p.name} seed={p.seed} size="sm" className="ring-2 ring-card" />
              ))}
              {people.length > 3 && (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-foreground ring-2 ring-card">
                  +{people.length - 3}
                </span>
              )}
            </div>
            {people.length === 1 && (
              <span className="ml-1.5 truncate text-xs font-medium text-foreground">{people[0].name}</span>
            )}
          </div>
        ) : (
          <span className="truncate text-xs text-muted-foreground">Sem responsável</span>
        )}
        {item.kind === 'video' && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" fill={item.commentsCount > 0 ? 'currentColor' : 'none'} />
            {item.commentsCount}
          </span>
        )}
      </div>

      <DeadlineBadge deadline={item.deadline} className="mt-2.5 w-fit" />
    </button>
  )
}

function VideoDetailModal({
  video,
  editorName,
  isOwner,
  labels,
  activeLabelIds,
  onToggleLabel,
  onManageLabels,
  teamMembers,
  collaboratorIds,
  onToggleCollaborator,
  onClose,
  onUpdateStage,
  onDeadlineUpdated,
}: {
  video: Video
  editorName: string | null
  isOwner: boolean
  labels: BoardLabel[]
  activeLabelIds: string[]
  onToggleLabel: (labelId: string) => void
  onManageLabels: () => void
  teamMembers: TeamMember[]
  collaboratorIds: string[]
  onToggleCollaborator: (memberId: string) => void
  onClose: () => void
  onUpdateStage: (stage: ProductionStage) => void
  onDeadlineUpdated: (deadline: string | null) => void
}) {
  const [playing, setPlaying] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="grid w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-2xl md:grid-cols-2"
      >
        {playing && video.url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={video.url}
            controls
            autoPlay
            className="aspect-video w-full bg-black md:aspect-auto md:h-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            disabled={!video.url}
            aria-label="Assistir vídeo"
            className="relative block aspect-video w-full text-left disabled:cursor-not-allowed md:aspect-auto md:h-full"
          >
            <CardVisual
              kind="video"
              posterUrl={video.posterUrl}
              duration={video.duration}
              className="h-full w-full"
            />
            {!video.url && (
              <span className="absolute inset-x-0 bottom-2 text-center text-[11px] font-medium text-white/80">
                Vídeo ainda processando…
              </span>
            )}
          </button>
        )}

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
            {isOwner ? (
              <DeadlineField
                videoId={video.id}
                deadline={video.deadline}
                onUpdated={onDeadlineUpdated}
              />
            ) : (
              <DeadlineBadge deadline={video.deadline} />
            )}
          </div>

          <LabelPicker labels={labels} activeLabelIds={activeLabelIds} onToggle={onToggleLabel} onManage={onManageLabels} />
          <CollaboratorPicker
            teamMembers={teamMembers}
            excludeId={video.editorId}
            collaboratorIds={collaboratorIds}
            onToggle={onToggleCollaborator}
          />

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

const fieldInputClass =
  'min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function DemandModal({
  demand,
  initialStage,
  teamMembers,
  clients,
  labels,
  activeLabelIds,
  onToggleLabel,
  onManageLabels,
  collaboratorIds,
  onToggleCollaborator,
  onClose,
  onSave,
  onDelete,
}: {
  demand: Demand | null
  initialStage: ProductionStage
  teamMembers: TeamMember[]
  clients: Client[]
  labels: BoardLabel[]
  activeLabelIds: string[]
  onToggleLabel: (labelId: string) => void
  onManageLabels: () => void
  collaboratorIds: string[]
  onToggleCollaborator: (memberId: string) => void
  onClose: () => void
  onSave: (input: DemandInput) => Promise<void>
  onDelete: (id: string) => void
}) {
  const isEditing = demand !== null
  const [title, setTitle] = useState(demand?.title ?? '')
  const [kind, setKind] = useState<DemandKind>(demand?.kind ?? 'demanda')
  const [clientId, setClientId] = useState(demand?.clientId ?? '')
  const [responsibleId, setResponsibleId] = useState(demand?.responsibleId ?? '')
  const [deadlineInput, setDeadlineInput] = useState(demand?.deadline ? demand.deadline.slice(0, 10) : '')
  const [stage, setStage] = useState<ProductionStage>(demand?.productionStage ?? initialStage)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        id: demand?.id,
        title: title.trim(),
        kind,
        clientId: clientId || null,
        responsibleId: responsibleId || null,
        deadline: deadlineInput ? new Date(`${deadlineInput}T00:00:00`).toISOString() : null,
        stage,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">{isEditing ? 'Editar demanda' : 'Nova demanda'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Field label="Título">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="Ex: Campanha de aniversário"
              className={fieldInputClass}
            />
          </Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as DemandKind)} className={fieldInputClass}>
              {DEMAND_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_META[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cliente">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={fieldInputClass}>
              <option value="">Sem cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
              className={fieldInputClass}
            >
              <option value="">Sem responsável</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo">
            <DateField value={deadlineInput} onChange={setDeadlineInput} clearable />
          </Field>
          <Field label="Etapa">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as ProductionStage)}
              className={fieldInputClass}
            >
              {COLUMNS.map((c) => (
                <option key={c.stage} value={c.stage}>
                  {productionStageLabel[c.stage]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isEditing ? (
          <>
            <LabelPicker labels={labels} activeLabelIds={activeLabelIds} onToggle={onToggleLabel} onManage={onManageLabels} />
            <CollaboratorPicker
              teamMembers={teamMembers}
              excludeId={responsibleId || null}
              collaboratorIds={collaboratorIds}
              onToggle={onToggleCollaborator}
            />
          </>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">Salve a demanda pra poder adicionar labels e colaboradores.</p>
        )}

        <div className="mt-5 flex items-center gap-2">
          {isEditing &&
            (confirmingDelete ? (
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-muted-foreground">Excluir?</span>
                <button
                  type="button"
                  onClick={() => onDelete(demand.id)}
                  className="inline-flex min-h-8 items-center rounded-lg bg-destructive px-2.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="inline-flex min-h-8 items-center rounded-lg bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-secondary/70"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="mr-auto inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline"
              >
                <Trash2 className="size-3.5" />
                Excluir
              </button>
            ))}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEditing ? 'Salvar' : 'Criar demanda'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function LabelPicker({
  labels,
  activeLabelIds,
  onToggle,
  onManage,
}: {
  labels: BoardLabel[]
  activeLabelIds: string[]
  onToggle: (labelId: string) => void
  onManage: () => void
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Labels</p>
        <button type="button" onClick={onManage} className="text-xs font-medium text-primary hover:underline">
          Gerenciar
        </button>
      </div>
      {labels.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Nenhuma label criada ainda.</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const active = activeLabelIds.includes(l.id)
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onToggle(l.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  active ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('size-2 rounded-full', LABEL_COLOR_CLASS[l.color] ?? 'bg-muted-foreground')} aria-hidden="true" />
                {l.text}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CollaboratorPicker({
  teamMembers,
  excludeId,
  collaboratorIds,
  onToggle,
}: {
  teamMembers: TeamMember[]
  excludeId: string | null
  collaboratorIds: string[]
  onToggle: (memberId: string) => void
}) {
  const options = teamMembers.filter((m) => m.id !== excludeId)
  if (options.length === 0) return null

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-muted-foreground">Colaboradores extras</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((m) => {
          const active = collaboratorIds.includes(m.id)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-medium transition-colors',
                active ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              <ClientAvatar name={m.name} seed={m.id} size="sm" />
              {m.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LabelManagerModal({
  labels,
  onChange,
  onClose,
}: {
  labels: BoardLabel[]
  onChange: (labels: BoardLabel[]) => void
  onClose: () => void
}) {
  const [newText, setNewText] = useState('')
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0].id)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  function addLabel() {
    const text = newText.trim()
    if (!text) return
    onChange([...labels, { id: `${Date.now()}`, text, color: newColor }])
    setNewText('')
  }

  function removeLabel(id: string) {
    onChange(labels.filter((l) => l.id !== id))
  }

  function recolor(id: string, color: string) {
    onChange(labels.map((l) => (l.id === id ? { ...l, color } : l)))
  }

  function startEditing(l: BoardLabel) {
    setEditingId(l.id)
    setEditingText(l.text)
  }

  function commitEditing() {
    const text = editingText.trim()
    if (editingId && text) {
      onChange(labels.map((l) => (l.id === editingId ? { ...l, text } : l)))
    }
    setEditingId(null)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Gerenciar labels</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {labels.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma label ainda.</p>}
          {labels.map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <div className="flex shrink-0 gap-1">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.id}
                    onClick={() => recolor(l.id, c.id)}
                    className={cn(
                      'size-4 rounded-full transition-transform',
                      c.className,
                      l.color === c.id ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-50 hover:opacity-80',
                    )}
                  />
                ))}
              </div>
              {editingId === l.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onBlur={commitEditing}
                  onKeyDown={(e) => e.key === 'Enter' && commitEditing()}
                  className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground outline-none focus:border-primary"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEditing(l)}
                  className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-sm text-foreground"
                >
                  <span className="truncate">{l.text}</span>
                  <Pencil className="size-3 shrink-0 text-muted-foreground" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeLabel(l.id)}
                aria-label={`Excluir label ${l.text}`}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex shrink-0 gap-1">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.id}
                onClick={() => setNewColor(c.id)}
                className={cn(
                  'size-4 rounded-full transition-transform',
                  c.className,
                  newColor === c.id ? 'ring-2 ring-foreground ring-offset-1 ring-offset-card' : 'opacity-50 hover:opacity-80',
                )}
              />
            ))}
          </div>
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
            placeholder="Nova label"
            className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addLabel}
            disabled={!newText.trim()}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
