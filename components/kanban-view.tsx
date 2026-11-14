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
  CalendarClock,
  AlignLeft,
  Archive,
  ArchiveRestore,
  CheckSquare,
  Paperclip,
  MoreHorizontal,
  Filter,
  Keyboard,
  ArrowLeft,
  ArrowRight,
  LayoutGrid,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { teamService, demandService, clientService, labelService, boardService } from '@/lib/services'
import {
  productionStageLabel,
  type BoardLabel,
  type ChecklistItem,
  type Client,
  type DemandActivity,
  type DemandComment,
  type LabelColor,
  type Demand,
  type DemandKind,
  type KanbanBoard,
  type ProductionStage,
  type TeamMember,
  type Video,
} from '@/lib/types'
import { ClientAvatar } from '@/components/client-avatar'
import { DeadlineBadge, DeadlineField } from '@/components/deadline-badge'
import { DateField } from '@/components/date-field'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { isDemo } from '@/lib/demo'
import { ApiError } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { ATTACHMENT_ACCEPTED_TYPES, COVER_IMAGE_TYPES, validateAttachmentFile } from '@/lib/upload'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from '@/components/motion'
import { toast } from '@/lib/toast'
import { Gesture } from '@/components/gestures'
import { PageHeader } from '@/components/page-header'

const COLUMNS: { stage: ProductionStage; dot: string }[] = [
  { stage: 'planejado', dot: 'bg-muted-foreground' },
  { stage: 'producao', dot: 'bg-sky-500' },
  { stage: 'edicao', dot: 'bg-violet-500' },
  { stage: 'aguardando_aprovacao', dot: 'bg-warning' },
  { stage: 'ajustes', dot: 'bg-danger' },
  { stage: 'aprovado', dot: 'bg-primary' },
  { stage: 'entregue', dot: 'bg-foreground' },
]

const stageBadgeStyles: Record<ProductionStage, string> = {
  planejado: 'bg-secondary text-foreground',
  producao: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  edicao: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  aguardando_aprovacao: 'bg-warning-soft text-warning-ink',
  ajustes: 'bg-danger-soft text-danger-ink',
  aprovado: 'bg-success text-success-foreground',
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

/** Formato antigo (só localStorage) — lido uma vez para migrar para a API. */
interface LegacyLabel {
  id: string
  text: string
  color: string
}

const LS_MIGRATED_KEY = 'aprova:kanban:labels-migrados'

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
  deadlineDone: boolean
  description: string | null
  /** Etapa (quadro de produção) ou id da coluna (quadro extra). */
  column: string
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
  labelIds: string[]
  collaboratorIds: string[]
  position: number
  hasDescription: boolean
  checklistDone: number
  checklistTotal: number
  deadlineDone: boolean
  coverUrl: string | null
  attachmentsCount: number
  responsibleId: string | null
  /** Card de quadro extra: a coluna é `columnId`, `stage` não vale. */
  boardId: string | null
  columnId: string | null
}

/** Coluna como o quadro desenha: etapa fixa (produção) ou coluna livre (quadro extra). */
interface ColumnDef {
  key: string
  label: string
  dot: string
  stage: ProductionStage | null
}

const LS_BOARD_KEY = 'aprova:kanban:quadro'

/** Chave da coluna de um card: etapa no quadro de produção, id da coluna nos extras. */
function columnKeyOf(d: { boardId: string | null; columnId: string | null; productionStage?: ProductionStage; stage?: ProductionStage }): string {
  return d.boardId ? d.columnId ?? '' : (d.productionStage ?? d.stage ?? 'planejado')
}

type DueFilter = 'overdue' | 'week' | 'none' | null

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
    labelIds: [],
    collaboratorIds: [],
    position: 0,
    hasDescription: false,
    checklistDone: 0,
    checklistTotal: 0,
    deadlineDone: false,
    coverUrl: null,
    attachmentsCount: 0,
    responsibleId: v.editorId ?? null,
    boardId: null,
    columnId: null,
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
    commentsCount: d.commentsCount,
    posterUrl: null,
    duration: 0,
    labelIds: d.labelIds,
    collaboratorIds: d.collaboratorIds,
    position: d.position,
    hasDescription: Boolean(d.description?.trim()),
    checklistDone: d.checklist.filter((c) => c.done).length,
    checklistTotal: d.checklist.length,
    deadlineDone: d.deadlineDone,
    coverUrl: d.attachments.find((a) => a.id === d.coverAttachmentId)?.url ?? null,
    attachmentsCount: d.attachments.length,
    responsibleId: d.responsibleId,
    boardId: d.boardId,
    columnId: d.columnId,
  }
}

export function KanbanView() {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'

  const team = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])

  // Quadro aberto: null = produção (7 etapas fixas); senão um quadro extra.
  const [boardId, setBoardIdState] = useState<string | null>(null)
  const boardsQuery = useQuery<KanbanBoard[]>((signal) => boardService.list(signal), [])
  const boards = boardsQuery.data ?? []
  const currentBoard = boardId ? boards.find((b) => b.id === boardId) ?? null : null
  function setBoardId(id: string | null) {
    // Guarda o total do quadro que está saindo (a aba mostra esse número).
    if (currentBoard && demandsReady) {
      const leaving = currentBoard.id
      const total = items.length
      boardsQuery.setData((prev) => (prev ?? []).map((x) => (x.id === leaving ? { ...x, cardsCount: total } : x)))
    }
    setBoardIdState(id)
    setOrder({})
    saveJSON(LS_BOARD_KEY, id)
  }
  useEffect(() => {
    const saved = loadJSON<string | null>(LS_BOARD_KEY, null)
    if (saved) setBoardIdState(saved)
  }, [])
  // Quadro salvo que não existe mais (apagado por alguém): volta para produção.
  useEffect(() => {
    if (boardId && boardsQuery.data && !boardsQuery.data.some((b) => b.id === boardId)) setBoardId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, boardsQuery.data])

  // De qual quadro são os dados em mãos: ao trocar de quadro o useQuery ainda
  // devolve a lista anterior por um render antes de marcar `loading`.
  const loadedBoardRef = useRef<string | null | undefined>(undefined)
  const demandsQuery = useQuery<Demand[]>(
    (signal) =>
      demandService.list(signal, { boardId }).then((list) => {
        loadedBoardRef.current = boardId
        return list
      }),
    [boardId],
  )
  const demandsReady = Boolean(demandsQuery.data) && !demandsQuery.loading && loadedBoardRef.current === boardId

  // Vídeos pertencem ao fluxo de aprovação, não ao quadro operacional. O
  // Kanban é composto exclusivamente pelas demandas criadas pela equipe.
  const demands = useMemo(
    () => (demandsQuery.data ?? []).filter((d) => d.boardId === boardId),
    [demandsQuery.data, boardId],
  )

  const columns: ColumnDef[] = currentBoard
    ? currentBoard.columns.map((c) => ({ key: c.id, label: c.name, dot: 'bg-muted-foreground', stage: null }))
    : COLUMNS.map((c) => ({ key: c.stage, label: productionStageLabel[c.stage], dot: c.dot, stage: c.stage }))
  const columnLabel = (key: string) => columns.find((c) => c.key === key)?.label ?? ''

  const [search, setSearch] = useState('')
  const [client, setClient] = useState(ALL_CLIENTS)
  const [kindFilter, setKindFilter] = useState<CardKind | typeof ALL_KINDS>(ALL_KINDS)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [activeItem, setActiveItem] = useState<{ kind: 'video' | 'demand'; id: string } | null>(null)
  /** Coluna (etapa ou id) onde o card novo vai nascer. */
  const [creatingStage, setCreatingStage] = useState<string | null>(null)

  // Filtros estilo Trello: etiquetas, pessoas (responsável ou colaborador) e prazo.
  const [filterLabels, setFilterLabels] = useState<string[]>([])
  const [filterPeople, setFilterPeople] = useState<string[]>([])
  const [filterDue, setFilterDue] = useState<DueFilter>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const activeFilterCount = filterLabels.length + filterPeople.length + (filterDue ? 1 : 0)
  function clearFilters() {
    setFilterLabels([])
    setFilterPeople([])
    setFilterDue(null)
  }
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [boardForm, setBoardForm] = useState<{ mode: 'create' } | { mode: 'rename'; board: KanbanBoard } | null>(null)
  const [deletingBoard, setDeletingBoard] = useState<KanbanBoard | null>(null)
  const [deletingColumn, setDeletingColumn] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const hoveredIdRef = useRef<string | null>(null)

  // Etiquetas, colaboradores e a ordem dos cards vêm da API (a equipe toda
  // vê o mesmo quadro). Só as colunas recolhidas são deste navegador.
  // `order` é só a prévia enquanto um card é arrastado; ao soltar vira
  // `position` no servidor.
  const labelsQuery = useQuery<BoardLabel[]>((signal) => labelService.list(signal), [])
  const labels = labelsQuery.data ?? []
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())
  const [order, setOrder] = useState<Record<string, string[]>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  // Só o número, para o botão "Arquivados (n)"; a lista é buscada ao abrir.
  const [archivedCount, setArchivedCount] = useState<number | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    setArchivedCount(null)
    demandService
      .list(ctrl.signal, { archived: true, boardId })
      .then((list) => setArchivedCount(list.length))
      .catch(() => setArchivedCount(null))
    return () => ctrl.abort()
  }, [boardId])
  const [managingLabels, setManagingLabels] = useState(false)
  const [localStateLoaded, setLocalStateLoaded] = useState(false)

  useEffect(() => {
    setCollapsedStages(new Set(loadJSON<string[]>(LS_COLLAPSED_KEY, [])))
    setLocalStateLoaded(true)
  }, [])

  // Migração única: etiquetas/colaboradores que viviam só neste navegador
  // sobem para a API (etiqueta com o mesmo nome é reaproveitada, sem duplicar).
  const migratingRef = useRef(false)
  useEffect(() => {
    if (migratingRef.current || !labelsQuery.data || !demandsQuery.data || isDemo()) return
    if (loadJSON(LS_MIGRATED_KEY, false)) return
    const legacyLabels = loadJSON<LegacyLabel[]>(LS_LABELS_KEY, [])
    const legacyCardLabels = loadJSON<Record<string, string[]>>(LS_CARD_LABELS_KEY, {})
    const legacyCollabs = loadJSON<Record<string, string[]>>(LS_COLLABORATORS_KEY, {})
    migratingRef.current = true
    void (async () => {
      try {
        const serverLabels = [...labelsQuery.data!]
        const idMap: Record<string, string> = {}
        const usedLegacy = new Set(Object.values(legacyCardLabels).flat())
        for (const l of legacyLabels) {
          if (!usedLegacy.has(l.id) && serverLabels.length > 0) continue
          const same = serverLabels.find((x) => x.text.trim().toLowerCase() === l.text.trim().toLowerCase())
          if (same) {
            idMap[l.id] = same.id
          } else {
            const color = (LABEL_COLORS.some((c) => c.id === l.color) ? l.color : 'sky') as LabelColor
            const created = await labelService.create({ text: l.text.trim().slice(0, 60), color })
            serverLabels.push(created)
            idMap[l.id] = created.id
          }
        }
        const memberIds = new Set((team.data ?? []).map((m) => m.id))
        for (const d of demandsQuery.data!) {
          const addLabels = (legacyCardLabels[d.id] ?? []).map((id) => idMap[id]).filter(Boolean)
          const addCollabs = (legacyCollabs[d.id] ?? []).filter((id) => memberIds.size === 0 || memberIds.has(id))
          const labelIds = Array.from(new Set([...d.labelIds, ...addLabels]))
          const collaboratorIds = Array.from(new Set([...d.collaboratorIds, ...addCollabs]))
          if (labelIds.length === d.labelIds.length && collaboratorIds.length === d.collaboratorIds.length) continue
          const saved = await demandService.update(d.id, { labelIds, collaboratorIds })
          demandsQuery.setData((prev) => (prev ?? []).map((x) => (x.id === saved.id ? saved : x)))
        }
        labelsQuery.setData(serverLabels)
        saveJSON(LS_MIGRATED_KEY, true)
        for (const k of [LS_LABELS_KEY, LS_CARD_LABELS_KEY, LS_COLLABORATORS_KEY]) {
          try {
            window.localStorage.removeItem(k)
          } catch {
            // sem storage
          }
        }
      } catch {
        // Tenta de novo na próxima visita; o quadro segue funcionando com o que está na API.
        migratingRef.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsQuery.data, demandsQuery.data, team.data])

  useEffect(() => {
    if (localStateLoaded) saveJSON(LS_COLLAPSED_KEY, Array.from(collapsedStages))
  }, [collapsedStages, localStateLoaded])

  function toggleCollapsed(stage: string) {
    setCollapsedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  function reorderPreview(stage: string, currentIds: string[], draggedId: string, overId: string, before: boolean) {
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

  /** Atualiza só labelIds/collaboratorIds do card, otimista, e desfaz se a API recusar. */
  async function patchDemandMeta(id: string, patch: Pick<Partial<Demand>, 'labelIds' | 'collaboratorIds'>) {
    const previous = demands.find((d) => d.id === id)
    if (!previous) return
    demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, ...patch } : d)))
    try {
      await demandService.update(id, patch)
    } catch (err) {
      demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === id ? previous : d)))
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar o card.')
    }
  }

  function toggleCardLabel(itemId: string, labelId: string) {
    const current = demands.find((d) => d.id === itemId)?.labelIds ?? []
    const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]
    void patchDemandMeta(itemId, { labelIds: next })
  }

  function toggleCollaborator(itemId: string, memberId: string) {
    const current = demands.find((d) => d.id === itemId)?.collaboratorIds ?? []
    const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]
    void patchDemandMeta(itemId, { collaboratorIds: next })
  }

  async function createLabel(text: string, color: LabelColor) {
    try {
      const created = await labelService.create({ text, color })
      labelsQuery.setData((prev) => [...(prev ?? []), created])
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar a etiqueta.')
    }
  }

  async function updateLabel(id: string, patch: { text?: string; color?: LabelColor }) {
    const previous = labels
    labelsQuery.setData((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)))
    try {
      await labelService.update(id, patch)
    } catch (err) {
      labelsQuery.setData(previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar a etiqueta.')
    }
  }

  async function removeLabel(id: string) {
    const previousLabels = labels
    const previousDemands = demands
    labelsQuery.setData((prev) => (prev ?? []).filter((l) => l.id !== id))
    demandsQuery.setData((prev) => (prev ?? []).map((d) => ({ ...d, labelIds: d.labelIds.filter((x) => x !== id) })))
    try {
      await labelService.remove(id)
    } catch (err) {
      labelsQuery.setData(previousLabels)
      demandsQuery.setData(previousDemands)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir a etiqueta.')
    }
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
    return demands.map((d) =>
      demandToItem(d, responsibleName(d.responsibleId), clientNameById(d.clientId)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demands, team.data, clients.data])

  const clientNames = useMemo(() => {
    const set = new Set<string>()
    ;(clients.data ?? []).forEach((c) => c.name && set.add(c.name))
    return [ALL_CLIENTS, ...Array.from(set).sort()]
  }, [clients.data])

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekEnd = todayStart.getTime() + 8 * 86400_000
  const isOverdue = (i: BoardItem) => Boolean(i.deadline && !i.deadlineDone && new Date(i.deadline).getTime() < todayStart.getTime())
  const isDueThisWeek = (i: BoardItem) => {
    if (!i.deadline || i.deadlineDone) return false
    const t = new Date(i.deadline).getTime()
    return t >= todayStart.getTime() && t < weekEnd
  }

  const filtered = items.filter((i) => {
    const byClient = client === ALL_CLIENTS || i.clientName === client
    const byKind = kindFilter === ALL_KINDS || i.kind === kindFilter
    const bySearch = search.trim() === '' || i.title.toLowerCase().includes(search.trim().toLowerCase())
    const byLabel = filterLabels.length === 0 || i.labelIds.some((id) => filterLabels.includes(id))
    const byPerson =
      filterPeople.length === 0 ||
      filterPeople.some((p) => i.responsibleId === p || i.collaboratorIds.includes(p))
    const byDue =
      !filterDue ||
      (filterDue === 'overdue' && isOverdue(i)) ||
      (filterDue === 'week' && isDueThisWeek(i)) ||
      (filterDue === 'none' && !i.deadline)
    return byClient && byKind && bySearch && byLabel && byPerson && byDue
  })

  const counts = {
    aguardando_aprovacao: items.filter((i) => i.stage === 'aguardando_aprovacao').length,
    ajustes: items.filter((i) => i.stage === 'ajustes').length,
    entregue: items.filter((i) => i.stage === 'entregue').length,
    overdue: items.filter(isOverdue).length,
    week: items.filter(isDueThisWeek).length,
    unassigned: items.filter((i) => !i.responsibleId).length,
  }

  const boardLoading =
    (!demandsReady && !demandsQuery.error) || (Boolean(boardId) && !currentBoard && boardsQuery.loading)
  const boardError = demandsQuery.error
  const retryBoard = () => {
    demandsQuery.refetch()
  }

  /**
   * Posição do card solto na coluna: o meio entre os vizinhos que a prévia
   * do arraste mostrou (vizinhos escondidos por filtro mantêm o lugar).
   */
  function dropPosition(id: string, stage: string): number {
    const others = demands
      .filter((d) => columnKeyOf(d) === stage && d.id !== id)
      .sort((a, b) => a.position - b.position)
    const preview = order[stage] ?? []
    const at = preview.indexOf(id)
    let index = others.length
    if (at !== -1) {
      const nextId = preview.slice(at + 1).find((x) => others.some((o) => o.id === x))
      const prevId = [...preview.slice(0, at)].reverse().find((x) => others.some((o) => o.id === x))
      if (nextId) index = others.findIndex((o) => o.id === nextId)
      else if (prevId) index = others.findIndex((o) => o.id === prevId) + 1
    }
    const before = others[index - 1]?.position
    const after = others[index]?.position
    if (before === undefined && after === undefined) return 1024
    if (before === undefined) return after! - 1024
    if (after === undefined) return before + 1024
    return (before + after) / 2
  }

  async function moveDemand(id: string, stage: string, positionOverride?: number) {
    const previous = demands.find((d) => d.id === id)
    if (!previous) return
    const position = positionOverride ?? dropPosition(id, stage)
    if (columnKeyOf(previous) === stage && previous.position === position) return
    const onBoard = Boolean(previous.boardId)
    demandsQuery.setData((prev) =>
      (prev ?? []).map((d) =>
        d.id === id
          ? onBoard
            ? { ...d, columnId: stage, position }
            : { ...d, productionStage: stage as ProductionStage, position }
          : d,
      ),
    )
    try {
      if (onBoard) await demandService.updateColumn(id, stage, position)
      else await demandService.updateStage(id, stage as ProductionStage, position)
    } catch (err) {
      demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === id ? previous : d)))
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível mover o card.')
    }
  }

  /** Fim da coluna (atalhos , e .). */
  function endOfColumn(id: string, key: string): number {
    const others = demands.filter((d) => columnKeyOf(d) === key && d.id !== id)
    return others.length ? Math.max(...others.map((d) => d.position)) + 1024 : 1024
  }

  function moveItem(item: BoardItem, stage: string) {
    if (item.kind !== 'video') void moveDemand(item.id, stage)
    setOrder({})
  }

  async function archiveDemand(id: string) {
    const previous = demands
    demandsQuery.setData((prev) => (prev ?? []).filter((d) => d.id !== id))
    try {
      await demandService.archive(id)
      setArchivedCount((n) => (n ?? 0) + 1)
      toast.success('Card arquivado. Ele fica em "Arquivados".')
    } catch (err) {
      demandsQuery.setData(previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível arquivar o card.')
    }
  }

  function restoredFromArchive(d: Demand) {
    demandsQuery.setData((prev) => [...(prev ?? []), d])
    setArchivedCount((n) => Math.max(0, (n ?? 1) - 1))
  }

  /** Atualiza o checklist do card na lista local sem refazer a busca. */
  function setChecklist(id: string, update: (items: ChecklistItem[]) => ChecklistItem[]) {
    demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === id ? { ...d, checklist: update(d.checklist) } : d)))
  }

  async function addChecklistItem(id: string, text: string) {
    try {
      const item = await demandService.addChecklistItem(id, text)
      setChecklist(id, (items) => [...items, item])
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar o item.')
    }
  }

  async function updateChecklistItem(id: string, itemId: string, patch: { text?: string; done?: boolean }) {
    const previous = demands.find((d) => d.id === id)?.checklist ?? []
    setChecklist(id, (items) => items.map((c) => (c.id === itemId ? { ...c, ...patch } : c)))
    try {
      await demandService.updateChecklistItem(id, itemId, patch)
    } catch (err) {
      setChecklist(id, () => previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar o item.')
    }
  }

  async function removeChecklistItem(id: string, itemId: string) {
    const previous = demands.find((d) => d.id === id)?.checklist ?? []
    setChecklist(id, (items) => items.filter((c) => c.id !== itemId))
    try {
      await demandService.removeChecklistItem(id, itemId)
    } catch (err) {
      setChecklist(id, () => previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover o item.')
    }
  }

  async function saveDemand(input: DemandInput) {
    try {
      const payload = {
        title: input.title,
        kind: input.kind,
        clientId: input.clientId,
        responsibleId: input.responsibleId,
        deadline: input.deadline,
        description: input.description,
      }
      let saved: Demand
      const move = (d: Demand) =>
        d.boardId
          ? d.columnId !== input.column
            ? demandService.updateColumn(d.id, input.column, endOfColumn(d.id, input.column))
            : Promise.resolve(d)
          : d.productionStage !== input.column
            ? demandService.updateStage(d.id, input.column as ProductionStage)
            : Promise.resolve(d)
      if (input.id) {
        saved = await demandService.update(input.id, { ...payload, deadlineDone: input.deadline ? input.deadlineDone : false })
        saved = await move(saved)
        const finalSaved = saved
        demandsQuery.setData((prev) => (prev ?? []).map((d) => (d.id === finalSaved.id ? finalSaved : d)))
      } else {
        saved = await demandService.create(
          boardId ? { ...payload, boardId, columnId: input.column } : payload,
        )
        saved = await move(saved)
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

  // Link de notificação (/kanban?card=<id>) abre o card direto, trocando de
  // quadro se ele estiver em outro.
  const pendingCardRef = useRef<string | null>(null)
  const lookedUpCardRef = useRef<string | null>(null)
  useEffect(() => {
    const cardId = new URLSearchParams(window.location.search).get('card')
    if (!cardId) return
    pendingCardRef.current = cardId
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
  useEffect(() => {
    const cardId = pendingCardRef.current
    if (!cardId || !demandsReady) return
    if (demands.some((d) => d.id === cardId)) {
      pendingCardRef.current = null
      setActiveItem({ kind: 'demand', id: cardId })
      return
    }
    if (lookedUpCardRef.current === cardId) {
      pendingCardRef.current = null
      toast.error('Não foi possível abrir esse card.')
      return
    }
    lookedUpCardRef.current = cardId
    demandService
      .get(cardId)
      .then((d) => {
        if (d.archivedAt) {
          pendingCardRef.current = null
          toast.error('Esse card foi arquivado. Ele está em "Arquivados".')
        } else if (d.boardId !== boardId) {
          setBoardId(d.boardId)
        } else {
          demandsQuery.refetch()
        }
      })
      .catch(() => {
        pendingCardRef.current = null
        toast.error('Esse card foi excluído.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandsReady, demands])

  /* ----------------------------- quadros extras ----------------------------- */

  function replaceBoard(b: KanbanBoard) {
    boardsQuery.setData((prev) => (prev ?? []).map((x) => (x.id === b.id ? b : x)))
  }

  async function submitBoardForm(name: string, columnNames: string[]) {
    try {
      if (boardForm?.mode === 'rename') {
        replaceBoard(await boardService.rename(boardForm.board.id, name))
      } else {
        const created = await boardService.create(name, columnNames.length ? columnNames : undefined)
        boardsQuery.setData((prev) => [...(prev ?? []), created])
        setBoardId(created.id)
      }
      setBoardForm(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar o quadro.')
    }
  }

  async function confirmDeleteBoard(b: KanbanBoard) {
    try {
      await boardService.remove(b.id)
      boardsQuery.setData((prev) => (prev ?? []).filter((x) => x.id !== b.id))
      if (boardId === b.id) setBoardId(null)
      setDeletingBoard(null)
      toast.success(`Quadro "${b.name}" excluído.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir o quadro.')
    }
  }

  async function addColumn(name: string) {
    if (!currentBoard) return
    try {
      replaceBoard(await boardService.addColumn(currentBoard.id, name))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar a coluna.')
    }
  }

  async function renameColumn(columnId: string, name: string) {
    if (!currentBoard) return
    const previous = currentBoard
    replaceBoard({ ...currentBoard, columns: currentBoard.columns.map((c) => (c.id === columnId ? { ...c, name } : c)) })
    try {
      replaceBoard(await boardService.updateColumn(currentBoard.id, columnId, { name }))
    } catch (err) {
      replaceBoard(previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível renomear a coluna.')
    }
  }

  /** Troca a coluna de lugar com a vizinha (posição no meio das próximas). */
  async function shiftColumn(columnId: string, dir: -1 | 1) {
    if (!currentBoard) return
    const cols = currentBoard.columns
    const i = cols.findIndex((c) => c.id === columnId)
    const j = i + dir
    if (i === -1 || j < 0 || j >= cols.length) return
    const beyond = cols[j + dir]
    const position = beyond ? (cols[j].position + beyond.position) / 2 : cols[j].position + dir * 1024
    const previous = currentBoard
    replaceBoard({
      ...currentBoard,
      columns: cols.map((c) => (c.id === columnId ? { ...c, position } : c)).sort((a, b) => a.position - b.position),
    })
    try {
      replaceBoard(await boardService.updateColumn(currentBoard.id, columnId, { position }))
    } catch (err) {
      replaceBoard(previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível mover a coluna.')
    }
  }

  async function removeColumn(columnId: string, moveTo?: string) {
    if (!currentBoard) return
    try {
      replaceBoard(await boardService.removeColumn(currentBoard.id, columnId, moveTo))
      if (moveTo) {
        demandsQuery.refetch()
      }
      setDeletingColumn(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir a coluna.')
    }
  }

  /* -------------------------------- atalhos -------------------------------- */

  // O listener é registrado uma vez; dados e ações sempre frescos via ref.
  const shortcutStateRef = useRef({ items, columns, labels, archiveDemand, toggleCollaborator, toggleCardLabel, moveDemand, endOfColumn })
  shortcutStateRef.current = { items, columns, labels, archiveDemand, toggleCollaborator, toggleCardLabel, moveDemand, endOfColumn }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (document.querySelector('[aria-modal="true"]')) return
      const {
        items: all,
        columns: cols,
        labels: ls,
        archiveDemand,
        toggleCollaborator,
        toggleCardLabel,
        moveDemand,
        endOfColumn,
      } = shortcutStateRef.current
      const hovered = hoveredIdRef.current ? all.find((i) => i.id === hoveredIdRef.current) ?? null : null
      const key = e.key
      if (key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (key === '?') {
        e.preventDefault()
        setShowShortcuts(true)
      } else if (key === 'f') {
        e.preventDefault()
        setFilterOpen((o) => !o)
      } else if (key === 'q' && user?.id) {
        const me = user.id
        setFilterPeople((p) => (p.includes(me) ? p.filter((x) => x !== me) : [...p, me]))
      } else if (key === 'x') {
        clearFilters()
      } else if (key === 'n') {
        e.preventDefault()
        setCreatingStage(hovered ? columnKeyOf(hovered) : cols[0]?.key ?? null)
      } else if (hovered && (key === 'Enter' || key === 'e')) {
        e.preventDefault()
        setActiveItem({ kind: 'demand', id: hovered.id })
      } else if (hovered && key === 'c') {
        hoveredIdRef.current = null
        void archiveDemand(hovered.id)
      } else if (hovered && key === ' ' && user?.id) {
        e.preventDefault()
        toggleCollaborator(hovered.id, user.id)
      } else if (hovered && /^[1-9]$/.test(key)) {
        const label = ls[Number(key) - 1]
        if (label) toggleCardLabel(hovered.id, label.id)
      } else if (hovered && (key === ',' || key === '.')) {
        const idx = cols.findIndex((c) => c.key === columnKeyOf(hovered))
        const target = cols[idx + (key === ',' ? -1 : 1)]
        if (target) void moveDemand(hovered.id, target.key, endOfColumn(hovered.id, target.key))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const activeDemand = activeItem?.kind === 'demand' ? demands.find((d) => d.id === activeItem.id) ?? null : null

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Fluxo de produção"
        title="Kanban"
        description="Organize as demandas de cada cliente do planejamento à entrega."
        actions={
          <button
            type="button"
            onClick={() => setCreatingStage(columns[0]?.key ?? 'planejado')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-display text-base text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-5" />
            Nova demanda
          </button>
        }
      />

      <BoardTabs
        boards={
          currentBoard && demandsReady
            ? boards.map((b) => (b.id === currentBoard.id ? { ...b, cardsCount: items.length } : b))
            : boards
        }
        currentId={boardId}
        onSelect={setBoardId}
        onCreate={() => setBoardForm({ mode: 'create' })}
        onRename={(b) => setBoardForm({ mode: 'rename', board: b })}
        onDelete={(b) => setDeletingBoard(b)}
      />

      {/* Cards de resumo */}
      {currentBoard ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <SummaryCard dot="bg-danger" label="Atrasados" value={counts.overdue} hint="prazo vencido" loading={boardLoading} />
          <SummaryCard dot="bg-warning" label="Vencem em 7 dias" value={counts.week} hint="próximos prazos" loading={boardLoading} />
          <SummaryCard dot="bg-sky-500" label="Sem responsável" value={counts.unassigned} hint="ninguém assumiu" loading={boardLoading} />
          <SummaryCard dot="bg-muted-foreground" label="Total no quadro" value={items.length} hint={`${columns.length} colunas`} loading={boardLoading} />
        </div>
      ) : (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryCard
          dot="bg-warning"
          label="Aguardando aprovação"
          value={counts.aguardando_aprovacao}
          hint="depende do cliente"
          loading={boardLoading}
        />
        <SummaryCard dot="bg-danger" label="Em ajustes" value={counts.ajustes} hint="voltou pra equipe" loading={boardLoading} />
        <SummaryCard dot="bg-primary" tone="success" label="Entregues" value={counts.entregue} hint="ciclo completo" loading={boardLoading} />
        <SummaryCard dot="bg-muted-foreground" label="Total no quadro" value={items.length} hint="todas as etapas" loading={boardLoading} />
      </div>
      )}

      {/* Quadro */}
      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="sr-only">{currentBoard ? currentBoard.name : 'Quadro de produção'}</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') e.currentTarget.blur()
              }}
              placeholder="Buscar..."
              title="Atalho: /"
              className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink sm:w-52"
            />
          </div>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as CardKind | typeof ALL_KINDS)}
            className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary-ink"
          >
            <option value={ALL_KINDS}>{ALL_KINDS}</option>
            {DEMAND_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              aria-expanded={filterOpen}
              title="Atalho: F"
              className={cn(
                'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary-ink/50',
                activeFilterCount > 0 ? 'border-primary-ink/60' : 'border-border',
              )}
            >
              <Filter className="size-4" />
              Filtrar
              {activeFilterCount > 0 && (
                <span className="rounded-[6px] bg-foreground px-1.5 text-[11px] font-semibold tabular-nums text-background">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <FilterPopover
                labels={labels}
                members={(team.data ?? []).filter((m) => m.name)}
                currentUserId={user?.id ?? null}
                selectedLabels={filterLabels}
                selectedPeople={filterPeople}
                due={filterDue}
                onToggleLabel={(id) => setFilterLabels((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))}
                onTogglePerson={(id) => setFilterPeople((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))}
                onDue={setFilterDue}
                onClear={clearFilters}
                onClose={() => setFilterOpen(false)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setManagingLabels(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary-ink/50"
          >
            <Tag className="size-4" />
            Etiquetas
          </button>
          <button
            type="button"
            onClick={() => setShowArchived(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary-ink/50"
          >
            <Archive className="size-4" />
            Arquivados
            {archivedCount !== null && archivedCount > 0 && (
              <span className="rounded-[6px] bg-secondary px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {archivedCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            aria-label="Atalhos de teclado"
            title="Atalhos de teclado (?)"
            className="hidden min-h-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-muted-foreground transition-colors hover:border-primary-ink/50 hover:text-foreground lg:inline-flex"
          >
            <Keyboard className="size-4" />
          </button>
        </div>
      </div>

      <nav aria-label="Clientes" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {clientNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setClient(name)}
            className={cn(
              'min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
              client === name
                ? 'border-selected bg-selected font-semibold text-selected-foreground'
                : 'border-border bg-card text-foreground hover:border-primary-ink/40',
            )}
          >
            {name}
          </button>
        ))}
      </nav>

      {activeFilterCount > 0 && !boardLoading && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Mostrando <span className="font-semibold text-foreground">{filtered.length}</span> de {items.length} cards
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-[8px] px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {boardLoading ? (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div key={col.key} className="flex w-72 shrink-0 flex-col gap-3">
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
      ) : items.length === 0 && !currentBoard ? (
        <div className="mt-4">
          <EmptyState
            icon={<Film className="size-7" />}
            title="Nenhuma demanda ainda"
            description="Crie uma demanda para acompanhar o trabalho da equipe neste cliente."
            action={
              <button
                type="button"
                onClick={() => setCreatingStage(columns[0]?.key ?? 'planejado')}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
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
          {columns.map((col, colIndex) => {
            const columnItems = sortByOrder(
              filtered.filter((i) => columnKeyOf(i) === col.key).sort((a, b) => a.position - b.position),
              order[col.key],
            )
            const isCollapsed = collapsedStages.has(col.key)

            const handleColumnDragOver = (e: React.DragEvent<HTMLElement>) => {
              if (!e.dataTransfer.types.includes('text/plain')) return
              e.preventDefault()
              setDragOverColumn(col.key)
            }
            const handleColumnDrop = (e: React.DragEvent<HTMLElement>) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              const item = items.find((i) => i.id === id)
              if (item) moveItem(item, col.key)
              setDragOverColumn(null)
              setDraggingId(null)
            }

            if (isCollapsed) {
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => toggleCollapsed(col.key)}
                  onDragOver={handleColumnDragOver}
                  onDragLeave={() => setDragOverColumn((prev) => (prev === col.key ? null : prev))}
                  onDrop={handleColumnDrop}
                  title={`Expandir ${col.label}`}
                  className={cn(
                    'flex w-11 shrink-0 flex-col items-center gap-2 rounded-2xl border border-transparent bg-card py-3 transition-colors hover:border-primary-ink/50',
                    dragOverColumn === col.key && 'border-primary-ink/40 bg-primary/5',
                  )}
                >
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className={cn('size-2 shrink-0 rounded-full', col.dot)} aria-hidden="true" />
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-foreground">
                    {columnItems.length}
                  </span>
                  <span className="mt-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-foreground [writing-mode:vertical-rl]">
                    {col.label}
                  </span>
                </button>
              )
            }

            return (
              <div
                key={col.key}
                onDragOver={handleColumnDragOver}
                onDragLeave={() => setDragOverColumn((prev) => (prev === col.key ? null : prev))}
                onDrop={handleColumnDrop}
                className={cn(
                  'flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-transparent p-2 transition-colors',
                  dragOverColumn === col.key && 'border-primary-ink/40 bg-primary/5',
                )}
              >
                <div className="flex items-center gap-2 px-1">
                  <span className={cn('size-2 shrink-0 rounded-full', col.dot)} aria-hidden="true" />
                  {currentBoard ? (
                    <ColumnTitle name={col.label} onRename={(name) => void renameColumn(col.key, name)} />
                  ) : (
                    <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">{col.label}</h3>
                  )}
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-foreground">
                    {columnItems.length}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center">
                    {currentBoard && (
                      <ColumnMenu
                        label={col.label}
                        canMoveLeft={colIndex > 0}
                        canMoveRight={colIndex < columns.length - 1}
                        canDelete={columns.length > 1}
                        onMoveLeft={() => void shiftColumn(col.key, -1)}
                        onMoveRight={() => void shiftColumn(col.key, 1)}
                        onDelete={() => setDeletingColumn(col.key)}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(col.key)}
                      title="Recolher coluna"
                      aria-label={`Recolher ${col.label}`}
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex max-h-[60vh] min-h-24 flex-col gap-3 overflow-y-auto pb-1">
                  {columnItems.map((item) => (
                    <BoardCard
                      key={item.id}
                      item={item}
                      itemLabels={labels.filter((l) => item.labelIds.includes(l.id))}
                      collaboratorNames={item.collaboratorIds
                        .map((id) => team.data?.find((m) => m.id === id))
                        .filter((m): m is TeamMember => Boolean(m && m.id !== item.responsibleSeed))}
                      onOpen={() =>
                        setActiveItem({ kind: item.kind === 'video' ? 'video' : 'demand', id: item.id })
                      }
                      onHover={(hovering) => {
                        if (hovering) hoveredIdRef.current = item.id
                        else if (hoveredIdRef.current === item.id) hoveredIdRef.current = null
                      }}
                      onDragStart={() => setDraggingId(item.id)}
                      onDragEndCard={() => {
                        setDraggingId(null)
                        setOrder({})
                      }}
                      onCardDragOver={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDragOverColumn(col.key)
                        if (!draggingId || draggingId === item.id) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const before = e.clientY < rect.top + rect.height / 2
                        reorderPreview(
                          col.key,
                          columnItems.map((i) => i.id),
                          draggingId,
                          item.id,
                          before,
                        )
                      }}
                    />
                  ))}
                  {columnItems.length === 0 &&
                    (col.key === 'aguardando_aprovacao' ? (
                      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-5 text-center">
                        <Gesture state="empty" className="h-16 w-auto" />
                        <p className="font-display text-sm text-foreground">Nada pra checar com o cliente</p>
                        <p className="text-xs text-muted-foreground">Arraste um card pra cá quando enviar.</p>
                      </div>
                    ) : (
                      <div className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
                        {activeFilterCount > 0 || search.trim() ? 'Nenhum card com esse filtro' : 'Arraste um card pra cá'}
                      </div>
                    ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCreatingStage(col.key)}
                  className="flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  Adicionar
                </button>
              </div>
            )
          })}
          {currentBoard && <AddColumnTile onAdd={(name) => void addColumn(name)} />}
        </div>
      )}

      <AnimatePresence>
        {activeDemand && (
          <DemandModal
            demand={activeDemand}
            initialColumn={columnKeyOf(activeDemand)}
            columnOptions={columns.map((c) => ({ value: c.key, label: c.label }))}
            columnFieldLabel={currentBoard ? 'Coluna' : 'Etapa'}
            teamMembers={team.data ?? []}
            clients={clients.data ?? []}
            labels={labels}
            activeLabelIds={activeDemand.labelIds}
            onToggleLabel={(labelId) => toggleCardLabel(activeDemand.id, labelId)}
            onManageLabels={() => setManagingLabels(true)}
            collaboratorIds={activeDemand.collaboratorIds.filter(
              (id) => id !== activeDemand.responsibleId,
            )}
            onToggleCollaborator={(memberId) => toggleCollaborator(activeDemand.id, memberId)}
            onAddChecklistItem={(text) => addChecklistItem(activeDemand.id, text)}
            onUpdateChecklistItem={(itemId, patch) => void updateChecklistItem(activeDemand.id, itemId, patch)}
            onRemoveChecklistItem={(itemId) => void removeChecklistItem(activeDemand.id, itemId)}
            currentUserId={user?.id ?? null}
            isOwner={isOwner}
            onCommentsCountChange={(delta) =>
              demandsQuery.setData((prev) =>
                (prev ?? []).map((d) =>
                  d.id === activeDemand.id ? { ...d, commentsCount: Math.max(0, d.commentsCount + delta) } : d,
                ),
              )
            }
            onDemandUpdated={(d) => demandsQuery.setData((prev) => (prev ?? []).map((x) => (x.id === d.id ? d : x)))}
            onClose={() => setActiveItem(null)}
            onSave={saveDemand}
            onArchive={(id) => {
              void archiveDemand(id)
              setActiveItem(null)
            }}
            onDelete={(id) => {
              deleteDemand(id)
              setActiveItem(null)
            }}
          />
        )}
        {creatingStage && (
          <DemandModal
            demand={null}
            initialColumn={creatingStage}
            columnOptions={columns.map((c) => ({ value: c.key, label: c.label }))}
            columnFieldLabel={currentBoard ? 'Coluna' : 'Etapa'}
            teamMembers={team.data ?? []}
            clients={clients.data ?? []}
            labels={labels}
            activeLabelIds={[]}
            onToggleLabel={() => {}}
            onManageLabels={() => setManagingLabels(true)}
            collaboratorIds={[]}
            onToggleCollaborator={() => {}}
            onAddChecklistItem={async () => {}}
            onUpdateChecklistItem={() => {}}
            onRemoveChecklistItem={() => {}}
            currentUserId={user?.id ?? null}
            isOwner={isOwner}
            onCommentsCountChange={() => {}}
            onDemandUpdated={() => {}}
            onClose={() => setCreatingStage(null)}
            onSave={saveDemand}
            onArchive={() => {}}
            onDelete={() => setCreatingStage(null)}
          />
        )}
        {showArchived && (
          <ArchivedPanel
            boardId={boardId}
            boardName={currentBoard?.name ?? null}
            clientName={clientNameById}
            onRestored={restoredFromArchive}
            onDeleted={() => setArchivedCount((n) => Math.max(0, (n ?? 1) - 1))}
            onClose={() => setShowArchived(false)}
          />
        )}
        {managingLabels && (
          <LabelManagerModal
            labels={labels}
            onCreate={createLabel}
            onUpdate={updateLabel}
            onRemove={removeLabel}
            onClose={() => setManagingLabels(false)}
          />
        )}
        {boardForm && (
          <BoardFormModal
            board={boardForm.mode === 'rename' ? boardForm.board : null}
            onSubmit={submitBoardForm}
            onClose={() => setBoardForm(null)}
          />
        )}
        {deletingBoard && (
          <ConfirmDeleteBoardModal
            board={deletingBoard}
            onConfirm={() => confirmDeleteBoard(deletingBoard)}
            onClose={() => setDeletingBoard(null)}
          />
        )}
        {deletingColumn && currentBoard && (
          <DeleteColumnModal
            column={currentBoard.columns.find((c) => c.id === deletingColumn) ?? null}
            others={currentBoard.columns.filter((c) => c.id !== deletingColumn)}
            cardsCount={demands.filter((d) => d.columnId === deletingColumn).length}
            onConfirm={(moveTo) => removeColumn(deletingColumn, moveTo)}
            onClose={() => setDeletingColumn(null)}
          />
        )}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      </AnimatePresence>
    </div>
  )
}

function SummaryCard({
  dot,
  tone,
  label,
  value,
  hint,
  loading,
}: {
  dot: string
  tone?: 'success'
  label: string
  value: number
  hint: string
  loading: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className={cn('mt-3 font-display text-3xl leading-none sm:text-4xl', tone === 'success' ? 'text-success-ink' : 'text-foreground')}>
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
  onHover,
}: {
  item: BoardItem
  itemLabels: BoardLabel[]
  collaboratorNames: TeamMember[]
  onHover?: (hovering: boolean) => void
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
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      className={cn(
        'group flex cursor-grab flex-col rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary-ink/50 active:cursor-grabbing',
        !item.boardId && item.stage === 'ajustes' ? 'border-danger-border' : 'border-border',
      )}
    >
      {item.coverUrl && (
        <div className="-mx-4 -mt-4 mb-3 h-32 overflow-hidden rounded-t-[15px] bg-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element -- R2/object URL, tamanho livre */}
          <img src={item.coverUrl} alt="" draggable={false} className="h-full w-full object-cover" />
        </div>
      )}
      <div
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium',
          !item.boardId && item.stage === 'ajustes' ? 'text-danger-ink' : 'text-muted-foreground',
        )}
      >
        <KindIcon className="size-3" />
        {KIND_META[item.kind].label}
        {item.kind === 'video' && item.duration > 0 && <span>· {formatDuration(item.duration)}</span>}
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <h4 className="min-w-0 truncate font-display text-[15px] font-bold text-foreground" title={item.title}>
          {item.title}
        </h4>
        {!item.boardId && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              stageBadgeStyles[item.stage],
            )}
          >
            {productionStageLabel[item.stage]}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {item.clientName || 'Sem cliente'}
      </p>

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
        {(item.kind === 'video' || item.commentsCount > 0) && (
          <span title="Comentários" className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="size-3.5" fill={item.commentsCount > 0 ? 'currentColor' : 'none'} />
            {item.commentsCount}
          </span>
        )}
        {(item.hasDescription || item.checklistTotal > 0 || item.attachmentsCount > 0) && (
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {item.attachmentsCount > 0 && (
              <span title="Anexos" className="inline-flex items-center gap-0.5 tabular-nums">
                <Paperclip className="size-3.5" />
                {item.attachmentsCount}
              </span>
            )}
            {item.hasDescription && (
              <span title="Tem descrição">
                <AlignLeft className="size-3.5" />
              </span>
            )}
            {item.checklistTotal > 0 && (
              <span
                title="Checklist"
                className={cn(
                  'inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 font-semibold tabular-nums',
                  item.checklistDone === item.checklistTotal ? 'bg-success-soft text-success-ink' : '',
                )}
              >
                <CheckSquare className="size-3.5" />
                {item.checklistDone}/{item.checklistTotal}
              </span>
            )}
          </span>
        )}
      </div>

      <DeadlineBadge deadline={item.deadline} done={item.deadlineDone} className="mt-2.5 w-fit" />
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
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary-ink/50"
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
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary-ink/50"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  Canal do cliente
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Link>
            )}
            {video.status === 'aprovado' && !video.fileRemovedAt && (
              <Link
                href={`/publicacoes?criar=${video.id}`}
                className="flex items-center justify-between rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-4" />
                  Agendar publicação
                </span>
                <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>

          {/* Ação rápida só faz sentido nesta etapa — nas demais, mover pelo seletor abaixo */}
          {video.productionStage === 'aguardando_aprovacao' && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onUpdateStage('ajustes')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-primary-ink bg-transparent font-display text-lg tracking-wide text-primary-ink transition-colors hover:bg-primary/10"
              >
                <RotateCcw className="size-4" />
                Pedir ajustes
              </button>
              <button
                type="button"
                onClick={() => onUpdateStage('aprovado')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-display text-base text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Check className="size-4" />
                Aprovar
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
  'h-10 w-full rounded-[10px] border border-border bg-card px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-secondary/50 focus:border-primary-ink'

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
  initialColumn,
  columnOptions,
  columnFieldLabel,
  teamMembers,
  clients,
  labels,
  activeLabelIds,
  onToggleLabel,
  onManageLabels,
  collaboratorIds,
  onToggleCollaborator,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onRemoveChecklistItem,
  currentUserId,
  isOwner,
  onCommentsCountChange,
  onDemandUpdated,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: {
  demand: Demand | null
  initialColumn: string
  columnOptions: { value: string; label: string }[]
  columnFieldLabel: string
  teamMembers: TeamMember[]
  clients: Client[]
  labels: BoardLabel[]
  activeLabelIds: string[]
  onToggleLabel: (labelId: string) => void
  onManageLabels: () => void
  collaboratorIds: string[]
  onToggleCollaborator: (memberId: string) => void
  onAddChecklistItem: (text: string) => Promise<void>
  onUpdateChecklistItem: (itemId: string, patch: { text?: string; done?: boolean }) => void
  onRemoveChecklistItem: (itemId: string) => void
  currentUserId: string | null
  isOwner: boolean
  onCommentsCountChange: (delta: number) => void
  onDemandUpdated: (d: Demand) => void
  onClose: () => void
  onSave: (input: DemandInput) => Promise<void>
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isEditing = demand !== null
  const [title, setTitle] = useState(demand?.title ?? '')
  const [kind, setKind] = useState<DemandKind>(demand?.kind ?? 'demanda')
  const [clientId, setClientId] = useState(demand?.clientId ?? '')
  const [responsibleId, setResponsibleId] = useState(demand?.responsibleId ?? '')
  const [deadlineInput, setDeadlineInput] = useState(demand?.deadline ? demand.deadline.slice(0, 10) : '')
  const [deadlineDone, setDeadlineDone] = useState(demand?.deadlineDone ?? false)
  const [description, setDescription] = useState(demand?.description ?? '')
  const [stage, setStage] = useState<string>(initialColumn || columnOptions[0]?.value || '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const KindIcon = KIND_META[kind].icon

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
        deadlineDone: Boolean(deadlineInput) && deadlineDone,
        description: description.trim() || null,
        column: stage,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? `Card ${demand.title}` : 'Novo card'}
        initial={{ scale: 0.98, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 12 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[20px] border border-border bg-card shadow-2xl sm:rounded-[20px]"
      >
        {(() => {
          const cover = demand?.attachments.find((a) => a.id === demand.coverAttachmentId)
          return cover ? (
            <div className="h-36 shrink-0 overflow-hidden bg-secondary sm:h-44">
              {/* eslint-disable-next-line @next/next/no-img-element -- R2/object URL */}
              <img src={cover.url} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null
        })()}
        {/* Cabeçalho: tipo + título editável, como no Trello */}
        <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <span className="mt-1.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-secondary text-muted-foreground">
            <KindIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={!isEditing}
              aria-label="Título"
              placeholder="Título do card"
              className="w-full rounded-[8px] bg-transparent px-1.5 py-1 font-display text-xl font-bold text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:bg-secondary/60 focus:bg-secondary/60"
            />
            <p className="px-1.5 text-xs text-muted-foreground">
              na coluna <span className="font-semibold text-foreground">{columnOptions.find((o) => o.value === stage)?.label ?? '—'}</span>
              {demand?.createdAt && <> · criado em {new Date(demand.createdAt).toLocaleDateString('pt-BR')}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-9 shrink-0 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_240px]">
          {/* Coluna principal */}
          <div className="min-w-0">
            {isEditing && (
              <LabelPicker labels={labels} activeLabelIds={activeLabelIds} onToggle={onToggleLabel} onManage={onManageLabels} />
            )}

            <section className={isEditing ? 'mt-6' : ''}>
              <SectionTitle icon={<AlignLeft className="size-4" />}>Descrição</SectionTitle>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={description.split('\n').length > 4 ? 8 : 4}
                maxLength={20000}
                placeholder="Briefing, links, referências, observações para a equipe…"
                className="mt-2 w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-ink"
              />
            </section>

            {isEditing && (
              <section className="mt-6">
                <AttachmentsSection demand={demand} onUpdated={onDemandUpdated} />
              </section>
            )}

            <section className="mt-6">
              {isEditing ? (
                <ChecklistSection
                  items={demand.checklist}
                  onAdd={onAddChecklistItem}
                  onUpdate={onUpdateChecklistItem}
                  onRemove={onRemoveChecklistItem}
                />
              ) : (
                <>
                  <SectionTitle icon={<ListChecks className="size-4" />}>Checklist</SectionTitle>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Crie o card para adicionar checklist, etiquetas e colaboradores.
                  </p>
                </>
              )}
            </section>

            {isEditing && (
              <section className="mt-8">
                <ActivitySection
                  demand={demand}
                  teamMembers={teamMembers}
                  currentUserId={currentUserId}
                  isOwner={isOwner}
                  onCommentsCountChange={onCommentsCountChange}
                />
              </section>
            )}
          </div>

          {/* Lateral com os campos do card */}
          <aside className="flex flex-col gap-3 md:border-l md:border-border md:pl-6">
            <Field label={columnFieldLabel}>
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={fieldInputClass}>
                {columnOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
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
              <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} className={fieldInputClass}>
                <option value="">Sem responsável</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Prazo</span>
              <DateField value={deadlineInput} onChange={setDeadlineInput} clearable />
              {deadlineInput && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={deadlineDone}
                    onChange={(e) => setDeadlineDone(e.target.checked)}
                    className="size-4 rounded accent-[var(--color-success,#16a34a)]"
                  />
                  Prazo cumprido
                </label>
              )}
            </div>
            {isEditing && (
              <CollaboratorPicker
                teamMembers={teamMembers}
                excludeId={responsibleId || null}
                collaboratorIds={collaboratorIds}
                onToggle={onToggleCollaborator}
              />
            )}
          </aside>
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5 sm:px-6">
          {isEditing &&
            (confirmingDelete ? (
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Excluir de vez? Não dá para desfazer.</span>
                <button
                  type="button"
                  onClick={() => onDelete(demand.id)}
                  className="inline-flex h-8 items-center rounded-[8px] bg-destructive px-2.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="inline-flex h-8 items-center rounded-[8px] bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-secondary/70"
                >
                  Voltar
                </button>
              </div>
            ) : (
              <div className="mr-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onArchive(demand.id)}
                  aria-label="Arquivar"
                  title="Arquivar"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <Archive className="size-4" />
                  <span className="hidden sm:inline">Arquivar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Excluir"
                  title="Excluir"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger-ink"
                >
                  <Trash2 className="size-4" />
                  <span className="hidden sm:inline">Excluir</span>
                </button>
              </div>
            ))}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-[10px] border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary',
              !isEditing && 'ml-auto',
            )}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            title="Ctrl/⌘ + Enter"
            className="inline-flex h-10 min-w-24 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEditing ? 'Salvar' : 'Criar card'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function formatBytes(n: number | null): string {
  if (n === null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

function fileExtension(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return ext.slice(0, 4).toUpperCase() || 'ARQ'
}

type UploadRow = { key: string; name: string; pct: number }

/**
 * Anexos do card: clicar em "Anexar" ou soltar arquivos aqui. Cada arquivo
 * sobe direto para o R2 e já aparece para a equipe; a 1ª imagem vira capa.
 */
function AttachmentsSection({ demand, onUpdated }: { demand: Demand; onUpdated: (d: Demand) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      const problem = validateAttachmentFile(file)
      if (problem) {
        toast.error(problem)
        continue
      }
      const key = `${file.name}-${Date.now()}-${Math.random()}`
      setUploads((u) => [...u, { key, name: file.name, pct: 0 }])
      try {
        const updated = await demandService.uploadAttachment(demand.id, file, (pct) =>
          setUploads((u) => u.map((r) => (r.key === key ? { ...r, pct } : r))),
        )
        onUpdated(updated)
      } catch (err) {
        toast.error(err instanceof ApiError || err instanceof Error ? `${file.name}: ${err.message}` : `Não foi possível anexar ${file.name}.`)
      } finally {
        setUploads((u) => u.filter((r) => r.key !== key))
      }
    }
  }

  async function run(id: string, action: () => Promise<Demand>, fail: string) {
    setBusyId(id)
    try {
      onUpdated(await action())
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : fail)
    } finally {
      setBusyId(null)
      setConfirmingId(null)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDragging(false)
        void uploadFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn('rounded-[12px] transition-colors', dragging && 'bg-primary/10 outline-dashed outline-2 outline-primary-ink/50')}
    >
      <SectionTitle
        icon={<Paperclip className="size-4" />}
        aside={
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Plus className="size-3.5" />
            Anexar
          </button>
        }
      >
        Anexos
      </SectionTitle>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_ACCEPTED_TYPES.join(',')}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void uploadFiles(files)
        }}
      />

      {demand.attachments.length === 0 && uploads.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-4 text-xs text-muted-foreground transition-colors hover:border-primary-ink/50 hover:text-foreground"
        >
          <Paperclip className="size-3.5" />
          Arraste arquivos aqui ou clique para anexar (até 100 MB)
        </button>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-3 rounded-[10px] px-1.5 py-1.5">
              <span className="grid h-10 w-14 shrink-0 place-items-center rounded-[8px] bg-secondary">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{u.name}</p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary-ink transition-all" style={{ width: `${u.pct}%` }} />
                </div>
              </div>
            </li>
          ))}
          {demand.attachments.map((a) => {
            const isImage = COVER_IMAGE_TYPES.includes(a.mimeType)
            const isCover = demand.coverAttachmentId === a.id
            return (
              <li key={a.id} className="group flex items-center gap-3 rounded-[10px] px-1.5 py-1.5 hover:bg-secondary/60">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-secondary text-[10px] font-bold text-muted-foreground"
                  aria-label={`Abrir ${a.name}`}
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- R2/object URL
                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    fileExtension(a.name)
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-foreground hover:underline"
                    title={a.name}
                  >
                    {a.name}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {[formatBytes(a.sizeBytes), timeAgoPt(a.createdAt), a.uploadedBy?.name].filter(Boolean).join(' · ')}
                    {isCover && <span className="ml-1.5 rounded-[4px] bg-secondary px-1 py-px font-semibold text-foreground">Capa</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5 text-xs">
                  {confirmingId === a.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void run(a.id, () => demandService.removeAttachment(demand.id, a.id), 'Não foi possível remover o anexo.')}
                        className="rounded-[6px] px-2 py-1 font-semibold text-danger-ink hover:bg-danger-soft"
                      >
                        Remover
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} className="rounded-[6px] px-2 py-1 text-muted-foreground hover:bg-secondary">
                        Voltar
                      </button>
                    </>
                  ) : (
                    <>
                      {isImage && (
                        <button
                          type="button"
                          disabled={busyId === a.id}
                          onClick={() =>
                            void run(a.id, () => demandService.setCover(demand.id, isCover ? null : a.id), 'Não foi possível mudar a capa.')
                          }
                          className="rounded-[6px] px-2 py-1 font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          {isCover ? 'Tirar capa' : 'Usar como capa'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmingId(a.id)}
                        aria-label={`Remover ${a.name}`}
                        className="grid size-7 place-items-center rounded-[6px] text-muted-foreground hover:bg-danger-soft hover:text-danger-ink"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const ACTIVITY_STAGE_LABEL = productionStageLabel as Record<string, string>

/** Frase do histórico ("moveu de Planejado para Edição"). */
function describeActivity(a: DemandActivity): string {
  const d = a.data ?? {}
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null)
  switch (a.type) {
    case 'criou':
      return 'criou este card'
    case 'moveu':
      return d.coluna
        ? `moveu de ${str('de') ?? '—'} para ${str('para') ?? '—'}`
        : `moveu de ${ACTIVITY_STAGE_LABEL[str('de') ?? ''] ?? '—'} para ${ACTIVITY_STAGE_LABEL[str('para') ?? ''] ?? '—'}`
    case 'titulo':
      return `renomeou para "${str('para') ?? ''}"`
    case 'responsavel':
      return str('para') ? `definiu ${str('para')} como responsável` : 'tirou o responsável'
    case 'prazo': {
      const para = str('para')
      return para ? `mudou o prazo para ${new Date(para).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : 'removeu o prazo'
    }
    case 'prazo_cumprido':
      return 'marcou o prazo como cumprido'
    case 'arquivou':
      return 'arquivou este card'
    case 'desarquivou':
      return 'restaurou este card do arquivo'
    case 'anexou':
      return `anexou "${str('arquivo') ?? ''}"`
    case 'removeu_anexo':
      return `removeu o anexo "${str('arquivo') ?? ''}"`
    case 'checklist_feito':
      return `concluiu "${str('item') ?? ''}"`
    default:
      return 'atualizou o card'
  }
}

function timeAgoPt(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const days = Math.round(h / 24)
  if (days < 7) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

/** Remove acentos/caixa para filtrar nomes na @menção. */
function fold(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Texto do comentário com as @menções destacadas. */
function CommentText({ text, names }: { text: string; names: string[] }) {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (sorted.length === 0) return <>{text}</>
  const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts = text.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'))
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('@') && sorted.includes(part.slice(1)) ? (
          <span key={i} className="rounded-[4px] bg-primary/20 px-0.5 font-semibold text-primary-ink">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/**
 * Comentários + histórico do card, numa linha do tempo só (como no Trello).
 * Comentar com @nome notifica a pessoa.
 */
function ActivitySection({
  demand,
  teamMembers,
  currentUserId,
  isOwner,
  onCommentsCountChange,
}: {
  demand: Demand
  teamMembers: TeamMember[]
  currentUserId: string | null
  isOwner: boolean
  onCommentsCountChange: (delta: number) => void
}) {
  const comments = useQuery<DemandComment[]>((signal) => demandService.listComments(demand.id, signal), [demand.id])
  // O histórico muda com o que se faz no próprio modal (checklist, etapa…): rebusca quando o card muda.
  const activityKey = `${demand.id}|${demand.productionStage}|${demand.checklist.filter((c) => c.done).length}|${demand.title}|${demand.deadlineDone}|${demand.attachments.map((a) => a.id).join(",")}`
  const activity = useQuery<DemandActivity[]>((signal) => demandService.listActivity(demand.id, signal), [activityKey])
  const [showDetails, setShowDetails] = useState(true)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [mention, setMention] = useState<{ query: string; start: number; caret: number } | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const mentionable = teamMembers.filter((m) => m.status === 'active' && m.name.trim() && m.id !== currentUserId)
  const options = mention
    ? mentionable.filter((m) => fold(m.name).includes(fold(mention.query))).slice(0, 6)
    : []
  const allNames = teamMembers.map((m) => m.name)

  function detectMention(value: string, caret: number) {
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret))
    if (m) {
      setMention({ query: m[2], start: caret - m[2].length - 1, caret })
      setHighlight(0)
    } else {
      setMention(null)
    }
  }

  function pickMember(member: TeamMember) {
    if (!mention) return
    const insert = `@${member.name} `
    const next = text.slice(0, mention.start) + insert + text.slice(mention.caret)
    setText(next)
    setPicked((p) => ({ ...p, [member.id]: member.name }))
    setMention(null)
    const pos = mention.start + insert.length
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
    })
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    const mentions = Object.entries(picked)
      .filter(([, name]) => body.includes(`@${name}`))
      .map(([id]) => id)
    setSending(true)
    try {
      const created = await demandService.addComment(demand.id, body.slice(0, 5000), mentions)
      comments.setData((prev) => [created, ...(prev ?? [])])
      onCommentsCountChange(1)
      setText('')
      setPicked({})
      if (mentions.length > 0) {
        toast.success(mentions.length === 1 ? 'Comentário enviado. A pessoa marcada foi avisada.' : 'Comentário enviado. As pessoas marcadas foram avisadas.')
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível comentar.')
    } finally {
      setSending(false)
    }
  }

  async function saveEdit(c: DemandComment) {
    const body = editingText.trim()
    setEditingId(null)
    if (!body || body === c.text) return
    const previous = comments.data ?? []
    comments.setData((prev) => (prev ?? []).map((x) => (x.id === c.id ? { ...x, text: body, editedAt: new Date().toISOString() } : x)))
    try {
      await demandService.updateComment(demand.id, c.id, body.slice(0, 5000))
    } catch (err) {
      comments.setData(previous)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível editar o comentário.')
    }
  }

  async function remove(c: DemandComment) {
    setConfirmingId(null)
    const previous = comments.data ?? []
    comments.setData((prev) => (prev ?? []).filter((x) => x.id !== c.id))
    onCommentsCountChange(-1)
    try {
      await demandService.removeComment(demand.id, c.id)
    } catch (err) {
      comments.setData(previous)
      onCommentsCountChange(1)
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível apagar o comentário.')
    }
  }

  type FeedItem = { kind: 'comment'; at: string; c: DemandComment } | { kind: 'activity'; at: string; a: DemandActivity }
  const feed: FeedItem[] = [
    ...(comments.data ?? []).map((c) => ({ kind: 'comment' as const, at: c.createdAt, c })),
    ...(showDetails ? (activity.data ?? []).map((a) => ({ kind: 'activity' as const, at: a.createdAt, a })) : []),
  ].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())

  const me = teamMembers.find((m) => m.id === currentUserId)

  return (
    <div>
      <SectionTitle
        icon={<MessageSquare className="size-4" />}
        aside={
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="rounded-[8px] px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {showDetails ? 'Ocultar histórico' : 'Mostrar histórico'}
          </button>
        }
      >
        Comentários e atividade
      </SectionTitle>

      {/* Caixa de comentário com @menção */}
      <div className="mt-3 flex gap-2.5">
        <ClientAvatar name={me?.name ?? 'Você'} seed={currentUserId ?? 'eu'} size="sm" className="mt-1.5 shrink-0" />
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={inputRef}
            value={text}
            rows={text ? 3 : 1}
            maxLength={5000}
            onChange={(e) => {
              setText(e.target.value)
              detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onKeyDown={(e) => {
              if (mention && options.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlight((h) => (h + 1) % options.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlight((h) => (h - 1 + options.length) % options.length)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  pickMember(options[highlight] ?? options[0])
                  return
                }
              }
              if (e.key === 'Escape' && mention) {
                e.stopPropagation()
                setMention(null)
                return
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                e.stopPropagation()
                void send()
              }
            }}
            onBlur={() => setTimeout(() => setMention(null), 150)}
            placeholder="Escreva um comentário… use @ para marcar alguém"
            aria-label="Escrever comentário"
            className="block w-full resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-ink"
          />
          {mention && options.length > 0 && (
            <ul
              role="listbox"
              aria-label="Marcar alguém"
              className="absolute left-0 top-full z-10 mt-1 w-64 max-w-full overflow-hidden rounded-[12px] border border-border bg-card p-1 shadow-xl"
            >
              {options.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickMember(m)
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-sm text-foreground',
                      i === highlight && 'bg-secondary',
                    )}
                  >
                    <ClientAvatar name={m.name} seed={m.id} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {text.trim() && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {sending && <Loader2 className="size-3.5 animate-spin" />}
                Comentar
              </button>
              <span className="text-[11px] text-muted-foreground">Ctrl/⌘ + Enter</span>
            </div>
          )}
        </div>
      </div>

      {/* Linha do tempo */}
      {comments.loading && !comments.data ? (
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-12 w-full rounded-[10px]" />
        </div>
      ) : comments.error ? (
        <p className="mt-4 text-xs text-danger-ink">
          Não deu para carregar os comentários.{' '}
          <button type="button" onClick={comments.refetch} className="font-semibold underline">
            Tentar de novo
          </button>
        </p>
      ) : feed.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">Nenhum comentário ainda.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3.5">
          {feed.map((f) =>
            f.kind === 'activity' ? (
              <li key={`a-${f.a.id}`} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <ClientAvatar name={f.a.author?.name || 'Ex-membro'} seed={f.a.author?.id ?? 'x'} size="sm" className="shrink-0 opacity-80" />
                <p className="min-w-0 pt-1">
                  <span className="font-semibold text-foreground">{f.a.author?.name || 'Alguém'}</span> {describeActivity(f.a)}
                  <span className="ml-1.5 whitespace-nowrap">· {timeAgoPt(f.a.createdAt)}</span>
                </p>
              </li>
            ) : (
              <li key={`c-${f.c.id}`} className="flex items-start gap-2.5">
                <ClientAvatar name={f.c.author?.name || 'Ex-membro'} seed={f.c.author?.id ?? 'x'} size="sm" className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{f.c.author?.name || 'Ex-membro da equipe'}</span>
                    <span className="ml-1.5">{timeAgoPt(f.c.createdAt)}</span>
                    {f.c.editedAt && <span className="ml-1">(editado)</span>}
                  </p>
                  {editingId === f.c.id ? (
                    <div className="mt-1">
                      <textarea
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation()
                            setEditingId(null)
                          }
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            e.stopPropagation()
                            void saveEdit(f.c)
                          }
                        }}
                        rows={3}
                        maxLength={5000}
                        className="block w-full resize-y rounded-[10px] border border-primary-ink bg-background px-3 py-2 text-sm text-foreground outline-none"
                      />
                      <div className="mt-1.5 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit(f.c)}
                          className="inline-flex h-8 items-center rounded-[8px] bg-foreground px-3 text-xs font-semibold text-background"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-8 items-center rounded-[8px] px-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 whitespace-pre-wrap break-words rounded-[10px] border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground">
                      <CommentText text={f.c.text} names={allNames} />
                    </div>
                  )}
                  {editingId !== f.c.id && (f.c.author?.id === currentUserId || isOwner) && (
                    <div className="mt-1 flex items-center gap-1 text-xs">
                      {confirmingId === f.c.id ? (
                        <>
                          <span className="text-muted-foreground">Apagar comentário?</span>
                          <button type="button" onClick={() => void remove(f.c)} className="rounded-[6px] px-1.5 py-0.5 font-semibold text-danger-ink hover:bg-danger-soft">
                            Apagar
                          </button>
                          <button type="button" onClick={() => setConfirmingId(null)} className="rounded-[6px] px-1.5 py-0.5 text-muted-foreground hover:bg-secondary">
                            Voltar
                          </button>
                        </>
                      ) : (
                        <>
                          {f.c.author?.id === currentUserId && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(f.c.id)
                                setEditingText(f.c.text)
                              }}
                              className="rounded-[6px] px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              Editar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmingId(f.c.id)}
                            className="rounded-[6px] px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:text-danger-ink hover:underline"
                          >
                            Apagar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}

/** Cards arquivados: restaurar volta para o fim da coluna; excluir é definitivo. */
function ArchivedPanel({
  boardId,
  boardName,
  clientName,
  onRestored,
  onDeleted,
  onClose,
}: {
  boardId: string | null
  boardName: string | null
  clientName: (id: string | null) => string
  onRestored: (d: Demand) => void
  onDeleted: () => void
  onClose: () => void
}) {
  const archived = useQuery<Demand[]>((signal) => demandService.list(signal, { archived: true, boardId }), [boardId])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const list = (archived.data ?? []).filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function restore(d: Demand) {
    setBusyId(d.id)
    try {
      const restored = await demandService.unarchive(d.id)
      archived.setData((prev) => (prev ?? []).filter((x) => x.id !== d.id))
      onRestored(restored)
      toast.success(`"${d.title}" voltou para ${productionStageLabel[restored.productionStage]}.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível restaurar o card.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(d: Demand) {
    setBusyId(d.id)
    try {
      await demandService.remove(d.id)
      archived.setData((prev) => (prev ?? []).filter((x) => x.id !== d.id))
      onDeleted()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível excluir o card.')
    } finally {
      setBusyId(null)
      setConfirmingId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Cards arquivados"
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Archive className="size-4 text-muted-foreground" />
          <h2 className="font-display text-lg font-bold text-foreground">Arquivados</h2>
          <span className="truncate text-xs text-muted-foreground">{boardName ?? 'Produção'}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto grid size-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar arquivados"
              aria-label="Buscar arquivados"
              className="h-10 w-full rounded-[10px] border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {archived.loading ? (
            <div className="flex flex-col gap-2 px-2">
              <Skeleton className="h-16 w-full rounded-[12px]" />
              <Skeleton className="h-16 w-full rounded-[12px]" />
            </div>
          ) : archived.error ? (
            <ErrorState message={archived.error} onRetry={archived.refetch} />
          ) : list.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">
              {query ? 'Nenhum arquivado com esse nome.' : 'Nenhum card arquivado.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {list.map((d) => (
                <li key={d.id} className="rounded-[12px] px-3 py-2.5 hover:bg-secondary/60">
                  <p className="truncate text-sm font-semibold text-foreground">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {productionStageLabel[d.productionStage]}
                    {d.clientId && ` · ${clientName(d.clientId)}`}
                    {d.archivedAt && ` · arquivado em ${new Date(d.archivedAt).toLocaleDateString('pt-BR')}`}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {confirmingId === d.id ? (
                      <>
                        <span className="text-xs text-muted-foreground">Excluir de vez?</span>
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => void remove(d)}
                          className="inline-flex h-8 items-center rounded-[8px] bg-destructive px-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          Excluir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="inline-flex h-8 items-center rounded-[8px] bg-secondary px-2.5 text-xs font-medium text-foreground"
                        >
                          Voltar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={() => void restore(d)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                        >
                          {busyId === d.id ? <Loader2 className="size-3.5 animate-spin" /> : <ArchiveRestore className="size-3.5" />}
                          Restaurar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(d.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger-ink"
                        >
                          <Trash2 className="size-3.5" />
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}

function SectionTitle({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      {aside && <span className="ml-auto">{aside}</span>}
    </div>
  )
}

/** Checklist do card: cada ação salva na hora (como etiquetas), sem depender do "Salvar". */
function ChecklistSection({
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  items: ChecklistItem[]
  onAdd: (text: string) => Promise<void>
  onUpdate: (itemId: string, patch: { text?: string; done?: boolean }) => void
  onRemove: (itemId: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const done = sorted.filter((c) => c.done).length
  const pct = sorted.length ? Math.round((done / sorted.length) * 100) : 0
  const visible = hideDone ? sorted.filter((c) => !c.done) : sorted

  async function add() {
    const text = draft.trim()
    if (!text || adding) return
    setAdding(true)
    setDraft('')
    try {
      await onAdd(text.slice(0, 500))
    } finally {
      setAdding(false)
    }
  }

  function commitEdit() {
    const text = editingText.trim()
    const current = items.find((c) => c.id === editingId)
    if (editingId && text && current && current.text !== text) onUpdate(editingId, { text: text.slice(0, 500) })
    setEditingId(null)
  }

  return (
    <div>
      <SectionTitle
        icon={<ListChecks className="size-4" />}
        aside={
          done > 0 && (
            <button
              type="button"
              onClick={() => setHideDone((v) => !v)}
              className="rounded-[8px] px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {hideDone ? `Mostrar concluídos (${done})` : 'Ocultar concluídos'}
            </button>
          )
        }
      >
        Checklist
      </SectionTitle>

      {sorted.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="w-9 text-right text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-success' : 'bg-primary-ink')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <ul className="mt-2 flex flex-col">
        {visible.map((c) => (
          <li key={c.id} className="group flex items-start gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-secondary/60">
            <input
              type="checkbox"
              checked={c.done}
              onChange={(e) => onUpdate(c.id, { done: e.target.checked })}
              aria-label={c.text}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--color-primary-ink,#3f6212)]"
            />
            {editingId === c.id ? (
              <input
                autoFocus
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setEditingId(null)
                  }
                }}
                className="min-w-0 flex-1 rounded-[6px] border border-primary-ink bg-background px-1.5 py-0.5 text-sm text-foreground outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(c.id)
                  setEditingText(c.text)
                }}
                className={cn(
                  'min-w-0 flex-1 break-words text-left text-sm',
                  c.done ? 'text-muted-foreground line-through' : 'text-foreground',
                )}
              >
                {c.text}
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              aria-label={`Remover ${c.text}`}
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-muted-foreground opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger-ink focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          maxLength={500}
          placeholder="Adicionar um item"
          aria-label="Adicionar um item ao checklist"
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-ink"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={!draft.trim() || adding}
          className="inline-flex h-9 items-center rounded-[10px] bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </div>
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
        <p className="text-xs font-medium text-muted-foreground">Etiquetas</p>
        <button type="button" onClick={onManage} className="text-xs font-medium text-primary-ink hover:underline">
          Gerenciar
        </button>
      </div>
      {labels.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">Nenhuma etiqueta criada ainda.</p>
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
                  active ? 'bg-selected text-selected-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
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
  // Convite pendente não tem conta ainda (nem nome): não pode colaborar.
  const options = teamMembers.filter((m) => m.id !== excludeId && m.status === 'active' && m.name.trim())
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
                active ? 'bg-selected text-selected-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground',
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
  onCreate,
  onUpdate,
  onRemove,
  onClose,
}: {
  labels: BoardLabel[]
  onCreate: (text: string, color: LabelColor) => Promise<void>
  onUpdate: (id: string, patch: { text?: string; color?: LabelColor }) => void
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const [newText, setNewText] = useState('')
  const [newColor, setNewColor] = useState<LabelColor>(LABEL_COLORS[0].id)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')

  function addLabel() {
    const text = newText.trim()
    if (!text) return
    setNewText('')
    void onCreate(text.slice(0, 60), newColor)
  }

  function removeLabel(id: string) {
    // Some de todos os cards da equipe: pede um segundo clique antes.
    if (confirmingRemove !== id) {
      setConfirmingRemove(id)
      return
    }
    setConfirmingRemove(null)
    onRemove(id)
  }

  function recolor(id: string, color: LabelColor) {
    onUpdate(id, { color })
  }

  function startEditing(l: BoardLabel) {
    setEditingId(l.id)
    setEditingText(l.text)
  }

  function commitEditing() {
    const text = editingText.trim()
    const current = labels.find((l) => l.id === editingId)
    if (editingId && text && current && current.text !== text) {
      onUpdate(editingId, { text: text.slice(0, 60) })
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
        role="dialog"
        aria-modal="true"
        aria-label="Gerenciar etiquetas"
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Gerenciar etiquetas</h2>
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
          {labels.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma etiqueta ainda.</p>}
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
                  className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1 text-sm text-foreground outline-none focus:border-primary-ink"
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
                onBlur={() => setConfirmingRemove((cur) => (cur === l.id ? null : cur))}
                aria-label={confirmingRemove === l.id ? `Confirmar exclusão de ${l.text}` : `Excluir etiqueta ${l.text}`}
                title={confirmingRemove === l.id ? 'Clique de novo para excluir de todos os cards' : 'Excluir'}
                className={cn(
                  'grid h-7 shrink-0 place-items-center rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive',
                  confirmingRemove === l.id && 'bg-danger-soft text-danger-ink hover:bg-danger-soft',
                )}
              >
                {confirmingRemove === l.id ? <span className="text-[11px] font-semibold">Excluir?</span> : <Trash2 className="size-3.5" />}
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
            placeholder="Nova etiqueta" maxLength={60}
            className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary-ink"
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

/* ------------------------------------------------------------------------ */
/*                               Quadros extras                             */
/* ------------------------------------------------------------------------ */

/** Abas dos quadros: Produção (fixo) + quadros extras da agência. */
function BoardTabs({
  boards,
  currentId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  boards: KanbanBoard[]
  currentId: string | null
  onSelect: (id: string | null) => void
  onCreate: () => void
  onRename: (b: KanbanBoard) => void
  onDelete: (b: KanbanBoard) => void
}) {
  const current = boards.find((b) => b.id === currentId) ?? null
  const tab = (active: boolean) =>
    cn(
      'relative inline-flex h-10 shrink-0 items-center gap-2 px-1 text-sm transition-colors',
      active
        ? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
        : 'font-medium text-muted-foreground hover:text-foreground',
    )
  return (
    <div className="mt-6 flex items-center gap-2 border-b border-border">
      <nav aria-label="Quadros" className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
        <button type="button" onClick={() => onSelect(null)} className={tab(currentId === null)} aria-current={currentId === null ? 'page' : undefined}>
          <LayoutGrid className="size-4" />
          Produção
        </button>
        {boards.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            className={tab(b.id === currentId)}
            aria-current={b.id === currentId ? 'page' : undefined}
          >
            <span className="max-w-[12rem] truncate">{b.name}</span>
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{b.cardsCount}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus className="size-4" />
          Novo quadro
        </button>
      </nav>
      {current && (
        <Menu
          label={`Opções do quadro ${current.name}`}
          items={[
            { label: 'Renomear quadro', icon: Pencil, onSelect: () => onRename(current) },
            { label: 'Excluir quadro', icon: Trash2, danger: true, onSelect: () => onDelete(current) },
          ]}
        />
      )}
    </div>
  )
}

type MenuItem = { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean }

/** Menu "⋯" simples: abre abaixo do botão, fecha com clique fora ou Esc. */
function Menu({ label, items, small }: { label: string; items: MenuItem[]; small?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'grid place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          small ? 'size-6' : 'size-8',
          open && 'bg-secondary text-foreground',
        )}
      >
        <MoreHorizontal className={small ? 'size-3.5' : 'size-4'} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-[12px] border border-border bg-card p-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40',
                it.danger ? 'text-danger-ink hover:bg-danger-soft' : 'text-foreground hover:bg-secondary',
              )}
            >
              <it.icon className="size-4 shrink-0" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ColumnMenu({
  label,
  canMoveLeft,
  canMoveRight,
  canDelete,
  onMoveLeft,
  onMoveRight,
  onDelete,
}: {
  label: string
  canMoveLeft: boolean
  canMoveRight: boolean
  canDelete: boolean
  onMoveLeft: () => void
  onMoveRight: () => void
  onDelete: () => void
}) {
  return (
    <Menu
      small
      label={`Opções da coluna ${label}`}
      items={[
        { label: 'Mover para a esquerda', icon: ArrowLeft, onSelect: onMoveLeft, disabled: !canMoveLeft },
        { label: 'Mover para a direita', icon: ArrowRight, onSelect: onMoveRight, disabled: !canMoveRight },
        { label: 'Excluir coluna', icon: Trash2, onSelect: onDelete, danger: true, disabled: !canDelete },
      ]}
    />
  )
}

/** Nome da coluna: clique para renomear (Enter salva, Esc cancela). */
function ColumnTitle({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  function commit() {
    const v = value.trim().slice(0, 60)
    setEditing(false)
    if (v && v !== name) onRename(v)
    else setValue(name)
  }
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setValue(name)
            setEditing(false)
          }
        }}
        aria-label="Nome da coluna"
        maxLength={60}
        className="h-7 min-w-0 flex-1 rounded-[6px] border border-primary-ink bg-background px-1.5 text-xs font-semibold uppercase tracking-wide text-foreground outline-none"
      />
    )
  }
  return (
    <h3 className="min-w-0 truncate">
      <button
        type="button"
        onClick={() => {
          setValue(name)
          setEditing(true)
        }}
        title="Clique para renomear"
        className="max-w-full truncate rounded-[6px] px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-secondary"
      >
        {name}
      </button>
    </h3>
  )
}

function AddColumnTile({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  function submit() {
    const v = name.trim()
    if (!v) return
    onAdd(v.slice(0, 60))
    setName('')
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-72 shrink-0 items-center gap-2 rounded-2xl border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary-ink/50 hover:text-foreground"
      >
        <Plus className="size-4" />
        Adicionar coluna
      </button>
    )
  }
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2 self-start rounded-2xl border border-border bg-card p-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Nome da coluna"
        maxLength={60}
        className="h-10 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary-ink"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim()}
          className="h-9 rounded-[10px] bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-[10px] px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Casca dos modais pequenos do quadro (overlay + cartão + título). */
function SmallModal({
  title,
  onClose,
  children,
  width = 'max-w-md',
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
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
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-card p-5 shadow-2xl', width)}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

const BOARD_TEMPLATES: { label: string; columns: string[] }[] = [
  { label: 'Simples', columns: ['A fazer', 'Fazendo', 'Feito'] },
  { label: 'Social media', columns: ['Ideias', 'Roteiro', 'Em criação', 'Aprovação', 'Agendado', 'Publicado'] },
  { label: 'Comercial', columns: ['Contato', 'Proposta enviada', 'Negociação', 'Fechado'] },
]

function BoardFormModal({
  board,
  onSubmit,
  onClose,
}: {
  board: KanbanBoard | null
  onSubmit: (name: string, columns: string[]) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(board?.name ?? '')
  const [template, setTemplate] = useState(0)
  const [columnsText, setColumnsText] = useState(BOARD_TEMPLATES[0].columns.join('\n'))
  const [saving, setSaving] = useState(false)
  const columnNames = columnsText
    .split('\n')
    .map((c) => c.trim().slice(0, 60))
    .filter(Boolean)
  const valid = name.trim().length > 0 && (board !== null || columnNames.length > 0)

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSubmit(name.trim().slice(0, 80), columnNames)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SmallModal title={board ? 'Renomear quadro' : 'Novo quadro'} onClose={onClose}>
      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Nome</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ex.: Social media, Comercial, Interno"
            className="h-10 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary-ink"
          />
        </label>
        {!board && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Começar com</span>
              <div className="flex flex-wrap gap-2">
                {BOARD_TEMPLATES.map((t, i) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => {
                      setTemplate(i)
                      setColumnsText(t.columns.join('\n'))
                    }}
                    className={cn(
                      'h-8 rounded-[8px] border px-3 text-xs font-medium transition-colors',
                      template === i ? 'border-foreground bg-secondary text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Colunas (uma por linha, dá para mudar depois)</span>
              <textarea
                value={columnsText}
                onChange={(e) => {
                  setColumnsText(e.target.value)
                  setTemplate(-1)
                }}
                rows={Math.min(8, Math.max(4, columnNames.length + 1))}
                className="resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:border-primary-ink"
              />
            </label>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!valid || saving}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {board ? 'Salvar' : 'Criar quadro'}
          </button>
        </div>
      </form>
    </SmallModal>
  )
}

function ConfirmDeleteBoardModal({
  board,
  onConfirm,
  onClose,
}: {
  board: KanbanBoard
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = typed.trim().toLowerCase() === board.name.trim().toLowerCase()
  return (
    <SmallModal title="Excluir quadro" onClose={onClose}>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        O quadro <span className="font-semibold text-foreground">{board.name}</span> será apagado com as{' '}
        {board.columns.length} colunas e{' '}
        <span className="font-semibold text-foreground">
          {board.cardsCount} {board.cardsCount === 1 ? 'card' : 'cards'}
        </span>{' '}
        (inclusive os arquivados), com comentários, checklists e anexos. Não dá para desfazer.
      </p>
      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Digite o nome do quadro para confirmar</span>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="h-10 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-danger"
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!matches || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Excluir quadro
        </button>
      </div>
    </SmallModal>
  )
}

function DeleteColumnModal({
  column,
  others,
  cardsCount,
  onConfirm,
  onClose,
}: {
  column: { id: string; name: string } | null
  others: { id: string; name: string }[]
  cardsCount: number
  onConfirm: (moveTo?: string) => Promise<void>
  onClose: () => void
}) {
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  if (!column) return null
  return (
    <SmallModal title="Excluir coluna" onClose={onClose}>
      {cardsCount > 0 ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{column.name}</span> tem {cardsCount}{' '}
            {cardsCount === 1 ? 'card' : 'cards'}. Para onde eles vão?
          </p>
          <select
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            aria-label="Mover os cards para"
            className="mt-3 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary-ink"
          >
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          A coluna <span className="font-semibold text-foreground">{column.name}</span> está vazia e será removida.
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm(cardsCount > 0 ? moveTo : undefined)
            } finally {
              setBusy(false)
            }
          }}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {cardsCount > 0 ? 'Mover e excluir' : 'Excluir coluna'}
        </button>
      </div>
    </SmallModal>
  )
}

/* ------------------------------------------------------------------------ */
/*                                   Filtro                                 */
/* ------------------------------------------------------------------------ */

function FilterPopover({
  labels,
  members,
  currentUserId,
  selectedLabels,
  selectedPeople,
  due,
  onToggleLabel,
  onTogglePerson,
  onDue,
  onClear,
  onClose,
}: {
  labels: BoardLabel[]
  members: TeamMember[]
  currentUserId: string | null
  selectedLabels: string[]
  selectedPeople: string[]
  due: DueFilter
  onToggleLabel: (id: string) => void
  onTogglePerson: (id: string) => void
  onDue: (d: DueFilter) => void
  onClear: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      // O botão "Filtrar" alterna sozinho; ignorar o clique nele.
      if (ref.current?.contains(t) || ref.current?.parentElement?.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Eu primeiro, como no "Cards atribuídos a mim" do Trello.
  const people = [...members].sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : a.name.localeCompare(b.name)))
  const check = (on: boolean) =>
    cn(
      'grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors',
      on ? 'border-foreground bg-foreground text-background' : 'border-border',
    )
  const row = 'flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-secondary'
  const dueOptions: { value: Exclude<DueFilter, null>; label: string }[] = [
    { value: 'overdue', label: 'Atrasados' },
    { value: 'week', label: 'Vencem nos próximos 7 dias' },
    { value: 'none', label: 'Sem prazo' },
  ]

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Filtrar cards"
      className="absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[14px] border border-border bg-card p-3 shadow-xl sm:left-auto sm:right-0"
    >
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-foreground">Filtrar</p>
        <button type="button" onClick={onClear} className="rounded-[6px] px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
          Limpar
        </button>
      </div>

      <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pessoas</p>
      <div className="mt-1 flex max-h-44 flex-col overflow-y-auto">
        {people.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Sem membros na equipe.</p>}
        {people.map((m) => {
          const on = selectedPeople.includes(m.id)
          return (
            <button key={m.id} type="button" onClick={() => onTogglePerson(m.id)} className={row} aria-pressed={on}>
              <span className={check(on)}>{on && <Check className="size-3" />}</span>
              <ClientAvatar name={m.name} seed={m.id} size="sm" />
              <span className="truncate">{m.id === currentUserId ? `${m.name} (eu)` : m.name}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Etiquetas</p>
      <div className="mt-1 flex max-h-40 flex-col overflow-y-auto">
        {labels.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhuma etiqueta criada.</p>}
        {labels.map((l) => {
          const on = selectedLabels.includes(l.id)
          const color = LABEL_COLORS.find((c) => c.id === l.color)?.className ?? 'bg-secondary'
          return (
            <button key={l.id} type="button" onClick={() => onToggleLabel(l.id)} className={row} aria-pressed={on}>
              <span className={check(on)}>{on && <Check className="size-3" />}</span>
              <span className={cn('size-2.5 shrink-0 rounded-full', color)} aria-hidden="true" />
              <span className="truncate">{l.text}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prazo</p>
      <div className="mt-1 flex flex-col">
        {dueOptions.map((o) => {
          const on = due === o.value
          return (
            <button key={o.value} type="button" onClick={() => onDue(on ? null : o.value)} className={row} aria-pressed={on}>
              <span className={cn(check(on), 'rounded-full')}>{on && <span className="size-1.5 rounded-full bg-background" />}</span>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/*                                   Atalhos                                */
/* ------------------------------------------------------------------------ */

const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: 'Quadro',
    items: [
      { keys: ['/'], label: 'Buscar' },
      { keys: ['N'], label: 'Novo card' },
      { keys: ['F'], label: 'Abrir o filtro' },
      { keys: ['Q'], label: 'Só os meus cards' },
      { keys: ['X'], label: 'Limpar filtros' },
      { keys: ['?'], label: 'Mostrar atalhos' },
    ],
  },
  {
    group: 'Com o mouse sobre um card',
    items: [
      { keys: ['Enter'], label: 'Abrir o card' },
      { keys: ['Espaço'], label: 'Entrar / sair do card' },
      { keys: ['1', '…', '9'], label: 'Pôr / tirar etiqueta (ordem da lista)' },
      { keys: [',', '.'], label: 'Mover para a coluna anterior / seguinte' },
      { keys: ['C'], label: 'Arquivar' },
    ],
  },
  {
    group: 'Card aberto',
    items: [
      { keys: ['Ctrl', 'Enter'], label: 'Salvar' },
      { keys: ['Esc'], label: 'Fechar' },
      { keys: ['@'], label: 'Mencionar no comentário' },
    ],
  },
]

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <SmallModal title="Atalhos de teclado" onClose={onClose} width="max-w-lg">
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {SHORTCUTS.map((g) => (
          <section key={g.group} className={g.group === 'Com o mouse sobre um card' ? 'sm:row-span-2' : ''}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.group}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {g.items.map((it) => (
                <li key={it.label} className="flex items-center justify-between gap-3 text-sm text-foreground">
                  <span>{it.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {it.keys.map((k) =>
                      k === '…' ? (
                        <span key={k} className="text-xs text-muted-foreground">
                          a
                        </span>
                      ) : (
                        <kbd
                          key={k}
                          className="min-w-6 rounded-[6px] border border-border bg-secondary px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground"
                        >
                          {k}
                        </kbd>
                      ),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SmallModal>
  )
}
