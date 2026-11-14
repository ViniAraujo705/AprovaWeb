'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen,
  Film,
  Copy,
  Check,
  Sparkles,
  Plus,
  X,
  Loader2,
  Archive,
  ArchiveRestore,
  Search,
  ImagePlus,
  HardDrive,
  FolderPlus,
  ArrowRight,
  Link2,
  Users,
  ArrowDownUp,
  ChevronDown,
} from 'lucide-react'
import { clientService, googleDriveService, projectService, videoService } from '@/lib/services'
import type { Client, GoogleDriveItem, Project, Video } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion, AnimatePresence } from '@/components/motion'
import { toast } from '@/lib/toast'
import { getArchivedProjectIds, unarchiveProject } from '@/lib/archived-projects'
import { ClientAvatar } from '@/components/client-avatar'
import { ProjectThumb } from '@/components/project-thumb'
import { ImageCropModal } from '@/components/image-crop-modal'
import { validatePhotoFile, UploadError } from '@/lib/upload'
import { uploadProjectPhoto } from '@/lib/project-photo'
import { useAuth } from '@/components/auth-provider'
import { publicUrl } from '@/lib/site'
import { DeadlineBadge } from '@/components/deadline-badge'
import { DrivePickerModal } from '@/components/project-drive'
import { getDeadlineUrgency } from '@/lib/format'
import {
  FilterMenu,
  ListHeader,
  SearchField,
  StatusTabs,
  ViewToggle,
  useViewMode,
  type TabItem,
} from '@/components/collection-controls'

const ALL_CLIENTS = 'Todos os clientes'
// Filtro/grupo dos projetos sem cliente cadastrado.
const AVULSOS = 'Avulsos'
// Valor do <select> de cliente no form para "sem cliente".
const NO_CLIENT = '__avulso__'

type SortMode = 'prazo' | 'atividade'
type ProjectTab = 'andamento' | 'atrasados' | 'entregues' | 'todos' | 'arquivados'
type ProjectSituation = 'andamento' | 'atrasado' | 'entregue'

const EMPTY_TAB_TITLE: Record<ProjectTab, string> = {
  andamento: 'Nada em andamento',
  atrasados: 'Nenhum projeto atrasado',
  entregues: 'Nenhum projeto entregue ainda',
  todos: 'Nenhum projeto',
  arquivados: 'Nenhum projeto arquivado',
}
const EMPTY_TAB_DESCRIPTION: Record<ProjectTab, string> = {
  andamento: 'Todos os projetos foram entregues. Crie um novo quando chegar a próxima entrega.',
  atrasados: 'Tudo dentro do prazo. 👌',
  entregues: 'Um projeto aparece aqui quando todos os vídeos dele forem aprovados.',
  todos: 'Crie um projeto para começar.',
  arquivados: 'Projetos arquivados aparecem aqui.',
}

/** Colunas da visão em lista (cabeçalho e linhas alinhados). */
const PROJECT_LIST_COLS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_64px_180px_130px_40px]'
const SORT_STORAGE_KEY = 'check:projetos-ordem'

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Lista de projetos (rota /projetos) — cada card leva ao detalhe do projeto
 * (`/projetos/[id]`), de onde o link da galeria pública (`/g/[link]`) pode
 * ser copiado. Sem essa lista, a tela de detalhe do projeto era inalcançável
 * pela navegação (só existia digitando a URL direto).
 */
export function ProjectsView() {
  const router = useRouter()
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  const projects = useQuery<Project[]>((signal) => projectService.list(undefined, signal), [])
  // Buscado à parte só para contar quantos vídeos cada projeto tem — o
  // hand-rolled useQuery não faz join, então dois fetches independentes.
  const videos = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])

  const [client, setClient] = useState(ALL_CLIENTS)
  const [search, setSearch] = useState('')
  // Padrão: o que vence primeiro no topo. A escolha fica no navegador.
  const [sortMode, setSortMode] = useState<SortMode>('prazo')
  useEffect(() => {
    try {
      if (localStorage.getItem(SORT_STORAGE_KEY) === 'atividade') setSortMode('atividade')
    } catch {
      // sem storage: fica no padrão
    }
  }, [])
  function changeSortMode(mode: SortMode) {
    setSortMode(mode)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, mode)
    } catch {
      // sem storage: vale só nesta visita
    }
  }

  // Arquivamento é só local (localStorage) — ver lib/archived-projects.ts.
  const [archivedIds, setArchivedIds] = useState<string[]>([])
  // Abas por situação (padrão das telas de coleção). "Arquivados" só aparece se houver.
  const [tab, setTab] = useState<ProjectTab>('andamento')
  const showArchived = tab === 'arquivados'
  const [view, setView] = useViewMode('check:projetos-visao')
  useEffect(() => {
    setArchivedIds(getArchivedProjectIds())
  }, [])

  function handleUnarchive(id: string) {
    unarchiveProject(id)
    setArchivedIds((prev) => prev.filter((x) => x !== id))
    toast.success('Projeto desarquivado')
  }

  // Criação de projeto direto por aqui, sem precisar enviar um vídeo primeiro.
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectClientId, setProjectClientId] = useState('')
  const [newClientName, setNewClientName] = useState<string | null>(null)
  // Projeto avulso: nome livre de quem recebe o link (opcional).
  const [contactName, setContactName] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [clientQuery, setClientQuery] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Foto do projeto: escolhida e recortada aqui, mas só enviada depois do
  // POST /projects — a presigned URL é escopada no id, que ainda não existe
  // enquanto o formulário está aberto.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoCropFile, setPhotoCropFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // Pastas/arquivos do Drive escolhidos no formulário: vinculados logo depois
  // do POST /projects (o vínculo precisa do id do projeto).
  const [driveItems, setDriveItems] = useState<GoogleDriveItem[]>([])
  const [drivePicking, setDrivePicking] = useState(false)
  const driveStatus = useQuery((signal) => googleDriveService.getStatus(signal), [])
  const photoInputRef = useRef<HTMLInputElement>(null)

  function setPhoto(file: File | null) {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
    setPhotoFile(file)
  }

  function openProjectForm() {
    setCreatingProject(true)
    setProjectName('')
    setProjectClientId('')
    setContactName('')
    setClientQuery('')
    setNewClientName(null)
    setCreateError(null)
    setPhoto(null)
    setPhotoError(null)
  }

  async function createInlineClient() {
    const name = (newClientName ?? '').trim()
    if (!name) return
    setCreatingClient(true)
    try {
      const created = await clientService.create({ name })
      clients.setData((prev) => [...(prev ?? []), created])
      setProjectClientId(created.id)
      setNewClientName(null)
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Falha ao criar cliente.')
    } finally {
      setCreatingClient(false)
    }
  }

  async function submitProject() {
    const name = projectName.trim()
    if (!name) {
      setCreateError('Informe o nome do projeto.')
      return
    }
    if (!projectClientId) {
      setCreateError('Selecione um cliente ou "Sem cliente (projeto avulso)".')
      return
    }
    const standalone = projectClientId === NO_CLIENT
    setCreatingBusy(true)
    setCreateError(null)
    try {
      const created = await projectService.create(
        standalone ? { name, contactName } : { name, clientId: projectClientId },
      )
      // Foto é acessório: se o upload falhar, o projeto criado continua valendo
      // e o usuário tenta de novo pela tela do projeto, em vez de perder tudo.
      if (photoFile) {
        try {
          await uploadProjectPhoto(created.id, photoFile)
        } catch (err) {
          toast.error(
            'Projeto criado, mas a foto não subiu',
            err instanceof UploadError || err instanceof ApiError ? err.message : undefined,
          )
        }
      }
      if (driveItems.length > 0) {
        const results = await Promise.allSettled(
          driveItems.map((item) => googleDriveService.linkToProject(created.id, item)),
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed > 0) {
          toast.error(
            'Projeto criado, mas parte do Drive não foi vinculada',
            `${failed} de ${driveItems.length} itens falharam — vincule de novo pela tela do projeto.`,
          )
        }
      }
      if (standalone && created.publicLink) {
        // O ponto do avulso é mandar o link: já deixa copiado. Se o navegador
        // recusar (perdeu o gesto do clique), o link está no topo do projeto.
        const copied = await navigator.clipboard
          .writeText(publicUrl(`/g/${created.publicLink}`))
          .then(() => true)
          .catch(() => false)
        toast.success(
          'Projeto avulso criado',
          copied ? 'O link da galeria já foi copiado.' : 'Copie o link da galeria no topo do projeto.',
        )
      } else {
        toast.success('Projeto criado')
      }
      router.push(`/projetos/${created.id}`)
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Falha ao criar projeto.')
      setCreatingBusy(false)
    }
  }

  // Clientes do seletor do modal "Novo projeto", filtrados pela busca.
  const pickerClients = useMemo(() => {
    const q = normalize(clientQuery.trim())
    const list = clients.data ?? []
    return q ? list.filter((c) => normalize(c.name).includes(q)) : list
  }, [clients.data, clientQuery])

  const countByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of videos.data ?? []) {
      if (!v.projectId) continue
      map.set(v.projectId, (map.get(v.projectId) ?? 0) + 1)
    }
    return map
  }, [videos.data])

  // Prazo de entrega do projeto = o mais próximo entre as entregas ainda não
  // aprovadas (só a versão atual de cada vídeo). Aprovado não tem mais o que
  // entregar, então não segura o projeto no topo.
  const nextDeadlineByProject = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of videos.data ?? []) {
      if (!v.projectId || !v.deadline || v.status === 'aprovado' || v.latestVersionId !== v.id) continue
      const prev = map.get(v.projectId)
      if (!prev || v.deadline < prev) map.set(v.projectId, v.deadline)
    }
    return map
  }, [videos.data])

  // Projeto cujos vídeos tiveram os arquivos apagados (armazenamento liberado).
  const storageReleasedProjects = useMemo(() => {
    const all = new Map<string, boolean>()
    for (const v of videos.data ?? []) {
      if (!v.projectId) continue
      all.set(v.projectId, (all.get(v.projectId) ?? true) && !!v.fileRemovedAt)
    }
    return new Set([...all].filter(([, removed]) => removed).map(([id]) => id))
  }, [videos.data])

  // "Ordem de entrega": o projeto que recebeu vídeo mais recentemente sobe pro
  // topo. Sem isso a lista seguia a criação do projeto, e um projeto antigo
  // que ganhava vídeo novo ficava enterrado entre os já entregues. Projeto sem
  // vídeo conta a própria criação como atividade, pra não afundar recém-criado.
  const lastActivityByProject = useMemo(() => {
    const map = new Map<string, string>()
    for (const v of videos.data ?? []) {
      if (!v.projectId || !v.createdAt) continue
      const prev = map.get(v.projectId)
      if (!prev || v.createdAt > prev) map.set(v.projectId, v.createdAt)
    }
    return map
  }, [videos.data])

  // O /projects embute `client` só com { id, nome } — sem photoUrl. Sempre
  // sobrepõe com o registro completo já buscado em /clients pra essa tela,
  // em vez de só cair para ele quando `p.client` vier ausente (o que nunca
  // acontece, já que o back sempre embute o parcial).
  const allProjects = useMemo(() => {
    const rawProjects = projects.data ?? []
    const clientById = new Map((clients.data ?? []).map((c) => [c.id, c]))
    return rawProjects.map((p) => {
      const fuller = clientById.get(p.clientId)
      return fuller ? { ...p, client: { ...p.client, ...fuller } } : p
    })
  }, [projects.data, clients.data])

  const clientNames = useMemo(() => {
    const set = new Set<string>()
    allProjects.forEach((p) => p.client?.name && set.add(p.client.name))
    const hasStandalone = allProjects.some((p) => !p.clientId)
    return [ALL_CLIENTS, ...Array.from(set).sort(), ...(hasStandalone ? [AVULSOS] : [])]
  }, [allProjects])

  // Capa do card: foto do projeto ou, sem ela, o poster do vídeo mais recente.
  const coverByProject = useMemo(() => {
    const map = new Map<string, { url: string; at: string }>()
    for (const v of videos.data ?? []) {
      if (!v.projectId || !v.posterUrl) continue
      const at = v.createdAt ?? ''
      const prev = map.get(v.projectId)
      if (!prev || at > prev.at) map.set(v.projectId, { url: v.posterUrl, at })
    }
    return map
  }, [videos.data])

  // Entregue = tem vídeo e todas as versões atuais foram aprovadas.
  const deliveredProjects = useMemo(() => {
    const all = new Map<string, boolean>()
    for (const v of videos.data ?? []) {
      if (!v.projectId || v.latestVersionId !== v.id) continue
      all.set(v.projectId, (all.get(v.projectId) ?? true) && v.status === 'aprovado')
    }
    return new Set([...all].filter(([, ok]) => ok).map(([id]) => id))
  }, [videos.data])

  const situationOf = (p: Project): ProjectSituation =>
    deliveredProjects.has(p.id)
      ? 'entregue'
      : getDeadlineUrgency(nextDeadlineByProject.get(p.id) ?? null) === 'overdue'
        ? 'atrasado'
        : 'andamento'

  const activeProjects = allProjects.filter((p) => !archivedIds.includes(p.id))
  const archivedCount = allProjects.length - activeProjects.length
  const tabCounts = {
    andamento: activeProjects.filter((p) => situationOf(p) !== 'entregue').length,
    atrasados: activeProjects.filter((p) => situationOf(p) === 'atrasado').length,
    entregues: activeProjects.filter((p) => situationOf(p) === 'entregue').length,
    todos: activeProjects.length,
    arquivados: archivedCount,
  }
  const tabs: TabItem<ProjectTab>[] = [
    { key: 'andamento', label: 'Em andamento', count: tabCounts.andamento },
    { key: 'atrasados', label: 'Atrasados', count: tabCounts.atrasados, tone: 'danger' },
    { key: 'entregues', label: 'Entregues', count: tabCounts.entregues },
    { key: 'todos', label: 'Todos', count: tabCounts.todos },
    ...(archivedCount > 0 || tab === 'arquivados'
      ? [{ key: 'arquivados' as const, label: 'Arquivados', count: tabCounts.arquivados }]
      : []),
  ]

  const inTab = (showArchived ? allProjects.filter((p) => archivedIds.includes(p.id)) : activeProjects).filter(
    (p) => {
      if (tab === 'andamento') return situationOf(p) !== 'entregue'
      if (tab === 'atrasados') return situationOf(p) === 'atrasado'
      if (tab === 'entregues') return situationOf(p) === 'entregue'
      return true
    },
  )

  const filtered = inTab.filter(
    (p) =>
      client === ALL_CLIENTS ||
      (client === AVULSOS ? !p.clientId : p.client?.name === client),
  )

  const searched = useMemo(() => {
    const q = normalize(search.trim())
    const matches = q
      ? filtered.filter(
          (p) =>
            normalize(p.name).includes(q) ||
            normalize(p.client?.name ?? '').includes(q) ||
            normalize(p.contactName ?? '').includes(q),
        )
      : filtered
    const activity = (p: Project) => {
      const video = lastActivityByProject.get(p.id) ?? ''
      const created = p.createdAt ?? ''
      return video > created ? video : created
    }
    const byActivity = (a: Project, b: Project) => activity(b).localeCompare(activity(a))
    // sort estável: empate (ou sem data nenhuma) mantém a ordem do back, por criação desc.
    if (sortMode === 'atividade') return [...matches].sort(byActivity)
    // Por prazo: quem vence primeiro (vencidos incluídos) no topo; projeto sem
    // prazo pendente vem depois, na ordem de atividade.
    return [...matches].sort((a, b) => {
      const da = nextDeadlineByProject.get(a.id)
      const db = nextDeadlineByProject.get(b.id)
      if (da && db) return da.localeCompare(db)
      if (da) return -1
      if (db) return 1
      return byActivity(a, b)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.map((p) => p.id).join(','), search, lastActivityByProject, nextDeadlineByProject, sortMode])

  function cardProps(p: Project) {
    return {
      project: p,
      cover: p.photoUrl ?? coverByProject.get(p.id)?.url ?? null,
      videoCount: countByProject.get(p.id) ?? 0,
      nextDeadline: nextDeadlineByProject.get(p.id) ?? null,
      situation: situationOf(p),
      storageReleased: storageReleasedProjects.has(p.id),
      archived: showArchived,
      onUnarchive: () => handleUnarchive(p.id),
    }
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      {/* Cabeçalho: título à esquerda, ação principal à direita. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="eyebrow">Galerias de entrega</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">Projetos</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Cada projeto agrupa os vídeos de uma entrega. Mande um link só e o cliente vê todos de uma vez.
          </p>
        </div>
        <button
          type="button"
          onClick={openProjectForm}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-display text-base text-primary-foreground transition hover:opacity-90 active:scale-[0.99]"
        >
          <Plus className="size-4" /> Novo projeto
        </button>
      </div>

      {allProjects.length > 0 && (
        <>
          <StatusTabs tabs={tabs} value={tab} onChange={setTab} className="mt-8" />
          {/* Barra de filtros: busca ocupa o espaço que sobra; grade/lista à direita. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar projeto ou cliente"
              className="w-full sm:w-auto sm:min-w-56 sm:max-w-sm sm:flex-1"
            />
            <FilterMenu
              icon={<Users className="size-4" />}
              label="Cliente"
              value={client}
              active={client !== ALL_CLIENTS}
              options={clientNames.map((c) => ({ value: c, label: c }))}
              onChange={setClient}
            />
            <FilterMenu
              icon={<ArrowDownUp className="size-4" />}
              label="Ordenar"
              value={sortMode}
              options={[
                { value: 'prazo', label: 'Prazo' },
                { value: 'atividade', label: 'Mais recentes' },
              ]}
              onChange={(v) => changeSortMode(v as SortMode)}
            />
            <div className="ml-auto">
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
        </>
      )}

      {creatingProject && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !creatingBusy && setCreatingProject(false)}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby="novo-projeto-title"
            onSubmit={(e) => {
              e.preventDefault()
              if (newClientName !== null) createInlineClient()
              else submitProject()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !creatingBusy && !photoCropFile) setCreatingProject(false)
            }}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-[20px]"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start gap-3.5 px-6 pt-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary/25 text-primary-ink">
                <FolderPlus className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="novo-projeto-title" className="font-display text-xl font-bold leading-tight text-foreground">
                  Novo projeto
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Uma galeria para reunir os vídeos de uma entrega.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreatingProject(false)}
                aria-label="Fechar"
                className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-6 overflow-y-auto px-6 py-6">
              {/* Capa (opcional) ao lado do nome — vira a miniatura do card na lista. */}
              <div className="flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    aria-label={photoPreview ? 'Trocar a capa do projeto' : 'Escolher uma capa para o projeto (opcional)'}
                    title="Capa do projeto (opcional)"
                    className={`group relative grid size-[76px] place-items-center overflow-hidden rounded-[14px] border text-muted-foreground transition hover:border-primary-ink hover:text-primary-ink focus-visible:ring-4 focus-visible:ring-primary/25 ${
                      photoPreview ? 'border-border' : 'border-dashed border-foreground/25 bg-secondary/50'
                    }`}
                  >
                    {photoPreview ? (
                      <>
                        <Image src={photoPreview} alt="" fill className="object-cover" sizes="76px" unoptimized />
                        <span className="absolute inset-0 hidden place-items-center bg-black/50 text-white group-hover:grid">
                          <ImagePlus className="size-5" />
                        </span>
                      </>
                    ) : (
                      <ImagePlus className="size-6" />
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        const invalid = validatePhotoFile(file)
                        if (invalid) {
                          setPhotoError(invalid)
                          return
                        }
                        setPhotoError(null)
                        setPhotoCropFile(file)
                      }}
                    />
                  </button>
                  {photoPreview ? (
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Remover
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Capa</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label htmlFor="novo-projeto-nome" className="text-sm font-medium text-foreground">
                    Nome do projeto
                  </label>
                  <input
                    id="novo-projeto-nome"
                    autoFocus
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value)
                      setCreateError(null)
                    }}
                    placeholder="Ex: Reel lançamento batom"
                    className="h-11 w-full rounded-[10px] border border-border bg-transparent px-3.5 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-primary-ink focus:ring-[3px] focus:ring-primary/25"
                  />
                  {photoError && <p className="text-xs text-destructive">{photoError}</p>}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span id="novo-projeto-cliente-label" className="text-sm font-medium text-foreground">
                    Cliente
                  </span>
                  {/* Criar cliente segue sendo do owner — o editor escolhe entre
                      os que já existem. */}
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setNewClientName(newClientName === null ? '' : null)}
                      className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {newClientName === null ? (
                        <>
                          <Plus className="size-3.5" /> Novo cliente
                        </>
                      ) : (
                        'Escolher existente'
                      )}
                    </button>
                  )}
                </div>
                {newClientName !== null ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      aria-label="Nome do novo cliente"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Nome do novo cliente"
                      className="h-11 w-full rounded-[10px] border border-border bg-transparent px-3.5 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-primary-ink focus:ring-[3px] focus:ring-primary/25"
                    />
                    <button
                      type="submit"
                      disabled={creatingClient || !newClientName.trim()}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {creatingClient ? <Loader2 className="size-4 animate-spin" /> : 'Salvar'}
                    </button>
                  </div>
                ) : clients.loading ? (
                  <Skeleton className="h-40 w-full rounded-[12px]" />
                ) : (
                  <>
                    {(clients.data ?? []).length > 6 && (
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={clientQuery}
                          onChange={(e) => setClientQuery(e.target.value)}
                          placeholder="Buscar cliente"
                          aria-label="Buscar cliente"
                          className="h-10 w-full rounded-[10px] border border-border bg-transparent pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary-ink"
                        />
                      </div>
                    )}
                    <div
                      role="radiogroup"
                      aria-labelledby="novo-projeto-cliente-label"
                      className="overflow-hidden rounded-[12px] border border-border"
                    >
                      <div className="max-h-[13.5rem] overflow-y-auto p-1">
                        {pickerClients.map((c) => (
                          <ClientOption
                            key={c.id}
                            selected={projectClientId === c.id}
                            onSelect={() => {
                              setProjectClientId(c.id)
                              setCreateError(null)
                            }}
                            icon={<ClientAvatar name={c.name} photoUrl={c.photoUrl} seed={c.id} size="md" />}
                            title={c.name}
                          />
                        ))}
                        {pickerClients.length === 0 && (
                          <p className="px-3 py-3 text-sm text-muted-foreground">
                            {clientQuery.trim() ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente cadastrado ainda.'}
                          </p>
                        )}
                      </div>
                      {/* Avulso fica fixo embaixo, fora da rolagem, pra nunca aparecer cortado. */}
                      <div className="border-t border-border bg-secondary/30 p-1">
                        <ClientOption
                          selected={projectClientId === NO_CLIENT}
                          onSelect={() => {
                            setProjectClientId(NO_CLIENT)
                            setCreateError(null)
                          }}
                          icon={
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                              <Link2 className="size-4" />
                            </span>
                          }
                          title="Sem cliente"
                          subtitle="Projeto avulso: só gera o link da galeria"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              {projectClientId === NO_CLIENT && newClientName === null && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="novo-projeto-contato" className="text-sm font-medium text-foreground">
                    Para quem é o link? <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input
                    id="novo-projeto-contato"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    maxLength={120}
                    placeholder="Nome de quem vai receber"
                    className="h-11 w-full rounded-[10px] border border-border bg-transparent px-3.5 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-primary-ink focus:ring-[3px] focus:ring-primary/25"
                  />
                  <p className="text-[13px] text-muted-foreground">
                    Ao criar, o link da galeria já sai copiado pra você mandar.
                  </p>
                </div>
              )}

              {driveStatus.data?.connected && (
                <div className="flex flex-col gap-2 rounded-[12px] border border-dashed border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Image src="/icons/google-drive.svg" alt="" width={14} height={14} />
                      Pastas do Google Drive <span className="font-normal text-muted-foreground">(opcional)</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setDrivePicking(true)}
                      className="inline-flex items-center gap-1 rounded-[8px] border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      <Plus className="size-3.5" /> Vincular do Drive
                    </button>
                  </div>
                  {driveItems.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {driveItems.map((item) => (
                        <li
                          key={item.id}
                          className="inline-flex max-w-full items-center gap-1 rounded-[8px] bg-secondary px-2 py-1 text-xs text-foreground"
                        >
                          <span className="truncate">{item.name}</span>
                          <button
                            type="button"
                            onClick={() => setDriveItems((prev) => prev.filter((p) => p.id !== item.id))}
                            aria-label={`Remover ${item.name}`}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {drivePicking && (
                <DrivePickerModal
                  title="Escolher do Google Drive"
                  linkedIds={new Set(driveItems.map((i) => i.id))}
                  onPick={(item) => setDriveItems((prev) => [...prev, item])}
                  onClose={() => setDrivePicking(false)}
                />
              )}

              {createError && (
                <p className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
                  {createError}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setCreatingProject(false)}
                disabled={creatingBusy}
                className="inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitProject}
                disabled={creatingBusy || newClientName !== null}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:scale-[0.99] disabled:opacity-50"
              >
                {creatingBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Criar projeto
                {!creatingBusy && <ArrowRight className="size-4" />}
              </button>
            </div>
          </motion.form>
          {photoCropFile && (
            <ImageCropModal
              file={photoCropFile}
              aspect={1}
              shape="rect"
              title="Ajustar foto do projeto"
              outputWidth={480}
              outputType="image/jpeg"
              onCancel={() => setPhotoCropFile(null)}
              onConfirm={(cropped) => {
                setPhotoCropFile(null)
                setPhoto(cropped)
              }}
            />
          )}
        </div>
      )}

      <div className="mt-6 flex flex-1 flex-col">
        {projects.loading ? (
          <div className="m-auto grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : projects.error ? (
          <ErrorState className="m-auto w-full" message={projects.error} onRetry={projects.refetch} />
        ) : allProjects.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            icon={<FolderOpen className="size-7" />}
            title={isOwner ? 'Nenhum projeto ainda' : 'Nenhum projeto atribuído a você ainda'}
            description={
              isOwner
                ? 'Crie um projeto para um cliente, ou envie o primeiro vídeo direto.'
                : 'Crie um projeto para um cliente, ou peça pro responsável da agência te adicionar a um que já existe.'
            }
            action={
              (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={openProjectForm}
                    className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Novo projeto
                  </button>
                  <Link
                    href="/upload"
                    className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary"
                  >
                    Enviar vídeo
                  </Link>
                </div>
              )
            }
          />
        ) : searched.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            icon={<FolderOpen className="size-7" />}
            title={
              search.trim() || client !== ALL_CLIENTS
                ? 'Nenhum projeto encontrado'
                : EMPTY_TAB_TITLE[tab]
            }
            description={
              search.trim()
                ? `Nada encontrado para "${search.trim()}" nesta aba.`
                : client !== ALL_CLIENTS
                  ? 'Esse cliente não tem projeto nesta aba.'
                  : EMPTY_TAB_DESCRIPTION[tab]
            }
          />
        ) : view === 'grid' ? (
          <StaggerList className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {searched.map((p) => (
              <ProjectGridCard key={p.id} {...cardProps(p)} />
            ))}
          </StaggerList>
        ) : (
          <div className="w-full">
            <ListHeader cols={PROJECT_LIST_COLS}>
              <span>Projeto</span>
              <span>Cliente</span>
              <span>Vídeos</span>
              <span>Prazo</span>
              <span>Situação</span>
              <span />
            </ListHeader>
            <StaggerList className="flex flex-col">
              {searched.map((p) => (
                <ProjectListRow key={p.id} {...cardProps(p)} />
              ))}
            </StaggerList>
          </div>
        )}
      </div>
    </div>
  )
}

type ProjectCardProps = {
  project: Project
  /** Foto do projeto ou poster do vídeo mais recente. */
  cover: string | null
  videoCount: number
  /** Prazo mais próximo entre as entregas ainda não aprovadas. */
  nextDeadline: string | null
  situation: ProjectSituation
  /** Arquivos de vídeo já apagados (armazenamento liberado). */
  storageReleased: boolean
  archived: boolean
  onUnarchive: () => void
}

const SITUATION_STYLE: Record<ProjectSituation, { label: string; className: string }> = {
  andamento: { label: 'Em andamento', className: 'bg-secondary text-foreground' },
  atrasado: { label: 'Atrasado', className: 'bg-danger-soft text-danger-ink' },
  entregue: { label: 'Entregue', className: 'bg-success-soft text-success-ink' },
}

function SituationBadge({ situation, className = '' }: { situation: ProjectSituation; className?: string }) {
  const s = SITUATION_STYLE[situation]
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-[11px] font-semibold ${s.className} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {s.label}
    </span>
  )
}

function clientLabelOf(project: Project) {
  return project.clientId
    ? (project.client?.name ?? 'Cliente')
    : `Avulso${project.contactName ? ` · ${project.contactName}` : ''}`
}

/** Copia o link da galeria pública; `compact` vira botão só-ícone. */
function CopyGalleryButton({ project, compact }: { project: Project; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const galleryPath = project.publicLink ? `/g/${project.publicLink}` : null
  if (!galleryPath) return null

  async function copy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(publicUrl(galleryPath!))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Link copiado' : 'Copiar link da galeria'}
      title={copied ? 'Link copiado' : 'Copiar link da galeria'}
      className={
        compact
          ? 'relative z-[2] grid size-9 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground'
          : 'relative z-[2] inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-black/55 px-2.5 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-black/70'
      }
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {!compact && (copied ? 'Copiado' : 'Copiar link')}
    </button>
  )
}

/** Card da grade: capa em destaque (foto/poster), nome, cliente e prazo. */
function ProjectGridCard({
  project,
  cover,
  videoCount,
  nextDeadline,
  situation,
  storageReleased,
  archived,
  onUnarchive,
}: ProjectCardProps) {
  const clientLabel = clientLabelOf(project)
  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex flex-col overflow-hidden rounded-[16px] border border-border bg-card transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg"
    >
      {/* Card inteiro clicável (stretched link); só os botões ficam acima, com z-index maior. */}
      <Link href={`/projetos/${project.id}`} aria-label={`Abrir projeto ${project.name}`} className="absolute inset-0 z-[1]" />

      <div className="relative aspect-[16/10] w-full overflow-hidden bg-secondary">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            unoptimized
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-secondary to-muted">
            <ClientAvatar
              name={project.client?.name ?? project.contactName ?? AVULSOS}
              photoUrl={project.client?.photoUrl}
              seed={project.clientId}
              size="xl"
            />
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {situation !== 'andamento' && <SituationBadge situation={situation} className="shadow-sm" />}
          {project.isExample && (
            <span className="inline-flex items-center gap-1 rounded-[6px] bg-card/90 px-2 py-0.5 text-[11px] font-semibold text-primary-ink shadow-sm">
              <Sparkles className="size-3" /> Exemplo
            </span>
          )}
        </div>
        <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          <CopyGalleryButton project={project} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground" title={clientLabel}>
            {clientLabel}
          </p>
          <h3 className="mt-0.5 truncate font-display text-base font-bold text-foreground" title={project.name}>
            {project.name}
          </h3>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Film className="size-3.5" />
            {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
          </span>
          {nextDeadline && <DeadlineBadge deadline={nextDeadline} className="ml-auto !py-0.5" />}
          {storageReleased && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Arquivos removidos">
              <HardDrive className="size-3.5" />
            </span>
          )}
        </div>
        {archived && (
          <button
            type="button"
            onClick={onUnarchive}
            className="relative z-[2] inline-flex h-8 w-fit items-center gap-1.5 rounded-[8px] border border-primary-ink/40 px-2.5 text-xs font-medium text-primary-ink transition-colors hover:bg-primary/10"
          >
            <ArchiveRestore className="size-3.5" />
            Desarquivar
          </button>
        )}
      </div>
    </motion.div>
  )
}

/** Linha da visão em lista: densa, alinhada ao cabeçalho de colunas. */
function ProjectListRow({
  project,
  cover,
  videoCount,
  nextDeadline,
  situation,
  archived,
  onUnarchive,
}: ProjectCardProps) {
  const clientLabel = clientLabelOf(project)
  return (
    <motion.div
      variants={staggerItem}
      className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3 transition-colors hover:bg-secondary/50 ${PROJECT_LIST_COLS}`}
    >
      <Link href={`/projetos/${project.id}`} aria-label={`Abrir projeto ${project.name}`} className="absolute inset-0 z-[1]" />

      <div className="flex min-w-0 items-center gap-3">
        <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-[8px] bg-secondary">
          {cover ? (
            <Image src={cover} alt="" fill className="object-cover" sizes="64px" unoptimized />
          ) : (
            <span className="grid h-full w-full place-items-center">
              <ClientAvatar
                name={project.client?.name ?? project.contactName ?? AVULSOS}
                photoUrl={project.client?.photoUrl}
                seed={project.clientId}
                size="sm"
              />
            </span>
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground" title={project.name}>
            {project.name}
          </p>
          {/* No celular, cliente e situação vão embaixo do nome. */}
          <p className="truncate text-xs text-muted-foreground md:hidden">
            {clientLabel} · {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
          </p>
        </div>
      </div>

      <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:block" title={clientLabel}>
        {clientLabel}
      </span>
      <span className="hidden text-sm tabular-nums text-muted-foreground md:block">{videoCount}</span>
      <span className="hidden md:block">
        {nextDeadline ? <DeadlineBadge deadline={nextDeadline} className="whitespace-nowrap !py-0.5" /> : <span className="text-sm text-muted-foreground">—</span>}
      </span>
      <span className="hidden md:block">
        <SituationBadge situation={situation} />
      </span>
      <span className="flex items-center justify-end gap-1">
        <span className="md:hidden">
          <SituationBadge situation={situation} />
        </span>
        {archived ? (
          <button
            type="button"
            onClick={onUnarchive}
            aria-label="Desarquivar"
            title="Desarquivar"
            className="relative z-[2] grid size-9 place-items-center rounded-[8px] text-primary-ink transition-colors hover:bg-primary/10"
          >
            <ArchiveRestore className="size-4" />
          </button>
        ) : (
          <CopyGalleryButton project={project} compact />
        )}
      </span>
    </motion.div>
  )
}

/** Linha selecionável do seletor de cliente no modal "Novo projeto". */
function ClientOption({
  selected,
  onSelect,
  icon,
  title,
  subtitle,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors ${
        selected ? 'bg-secondary' : 'hover:bg-secondary/60'
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm text-foreground ${selected ? 'font-semibold' : 'font-medium'}`}>
          {title}
        </span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25'
        }`}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  )
}
