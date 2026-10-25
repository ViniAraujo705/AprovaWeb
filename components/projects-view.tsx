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
} from 'lucide-react'
import { clientService, projectService, videoService } from '@/lib/services'
import type { Client, Project, Video } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion } from '@/components/motion'
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

const ALL_CLIENTS = 'Todos os clientes'
// Filtro/grupo dos projetos sem cliente cadastrado.
const AVULSOS = 'Avulsos'
// Valor do <select> de cliente no form para "sem cliente".
const NO_CLIENT = '__avulso__'

type SortMode = 'prazo' | 'atividade'
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
  const [showArchived, setShowArchived] = useState(false)
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
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Foto do projeto: escolhida e recortada aqui, mas só enviada depois do
  // POST /projects — a presigned URL é escopada no id, que ainda não existe
  // enquanto o formulário está aberto.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoCropFile, setPhotoCropFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
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

  const archivedCount = allProjects.filter((p) => archivedIds.includes(p.id)).length
  const visibleProjects = allProjects.filter((p) =>
    showArchived ? archivedIds.includes(p.id) : !archivedIds.includes(p.id),
  )

  const filtered = visibleProjects.filter(
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
  }, [filtered, search, lastActivityByProject, nextDeadlineByProject, sortMode])

  // Só agrupa por cliente quando o filtro está em "Todos os clientes" — com
  // um cliente específico selecionado a lista já é de um só cliente.
  const groups = useMemo(() => {
    if (client !== ALL_CLIENTS) return null
    const map = new Map<string, { client: Client | undefined; clientId: string; projects: Project[] }>()
    for (const p of searched) {
      const key = p.clientId || 'sem-cliente'
      if (!map.has(key)) map.set(key, { client: p.client, clientId: key, projects: [] })
      map.get(key)!.projects.push(p)
    }
    const all = Array.from(map.values())
    // Por prazo, o grupo do cliente com a entrega mais urgente sobe: `searched`
    // já vem ordenado, e o Map guarda a ordem de inserção. Por atividade segue
    // alfabético. Avulsos sempre por último no alfabético.
    if (sortMode === 'prazo') return all
    return all.sort((a, b) => {
      if (!a.client !== !b.client) return a.client ? -1 : 1
      return (a.client?.name ?? '').localeCompare(b.client?.name ?? '', 'pt-BR')
    })
  }, [searched, client, sortMode])

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="xl:max-w-md">
          <p className="eyebrow">Galerias de entrega</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">Projetos</h1>
          <p className="mt-3 text-base text-muted-foreground">
            Cada projeto agrupa os vídeos de uma entrega — mande o link da galeria pro cliente ver
            todos de uma vez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {allProjects.length > 0 && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar projeto ou cliente..."
                  className="min-h-11 w-56 rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Ordem:</span>
                <select
                  value={sortMode}
                  onChange={(e) => changeSortMode(e.target.value as SortMode)}
                  className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary-ink"
                >
                  <option value="prazo">Prazo de entrega</option>
                  <option value="atividade">Atividade recente</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Cliente:</span>
                <select
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary-ink"
                >
                  {clientNames.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
                showArchived
                  ? 'border-primary-ink bg-primary/10 text-primary-ink'
                  : 'border-border bg-card text-foreground hover:bg-secondary'
              }`}
            >
              <Archive className="size-4" />
              {showArchived ? 'Ver ativos' : `Arquivados (${archivedCount})`}
            </button>
          )}
          {!creatingProject && (
            <button
              type="button"
              onClick={openProjectForm}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-display text-base text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" /> Novo projeto
            </button>
          )}
        </div>
      </div>

      {creatingProject && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Novo projeto</span>
            <button
              type="button"
              onClick={() => setCreatingProject(false)}
              aria-label="Cancelar"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            {/* Foto opcional do projeto — vira a miniatura do card na lista. */}
            <div className="shrink-0">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                aria-label={photoPreview ? 'Trocar a foto do projeto' : 'Escolher uma foto do projeto'}
                title="Foto do projeto (opcional)"
                className={`group relative grid size-14 place-items-center overflow-hidden rounded-xl border border-border bg-card text-muted-foreground/70 transition-colors hover:border-primary-ink/50 hover:text-foreground ${
                  photoPreview ? '' : 'border-dashed'
                }`}
              >
                {photoPreview ? (
                  <Image src={photoPreview} alt="" fill className="object-cover" sizes="56px" unoptimized />
                ) : (
                  <ImagePlus className="size-5" />
                )}
                <span className="absolute inset-0 hidden place-items-center bg-black/50 text-white group-hover:grid">
                  <ImagePlus className="size-4" />
                </span>
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
              {photoPreview && (
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="mt-1 block w-14 text-center text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Remover
                </button>
              )}
            </div>

            <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nome do projeto (ex: Reel lançamento batom)"
              className="min-h-11 self-start rounded-lg sm:mt-[1.625rem] w-full border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
            />
            <div className="flex flex-col gap-1.5">
              {/* Criar cliente segue sendo do owner — o editor escolhe entre
                  os que já existem. */}
              <div className="flex min-h-5 items-center justify-between">
                {isOwner &&
                  (newClientName === null ? (
                    <button
                      type="button"
                      onClick={() => setNewClientName('')}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3" /> Novo cliente
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNewClientName(null)}
                      className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" /> Cancelar
                    </button>
                  ))}
              </div>
              {newClientName === null ? (
                <select
                  value={projectClientId}
                  onChange={(e) => setProjectClientId(e.target.value)}
                  disabled={clients.loading}
                  className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary-ink disabled:opacity-60"
                >
                  <option value="" disabled>
                    {clients.loading ? 'Carregando…' : 'Selecione o cliente'}
                  </option>
                  <option value={NO_CLIENT}>Sem cliente (projeto avulso)</option>
                  {(clients.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Nome do cliente"
                    className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
                  />
                  <button
                    type="button"
                    onClick={createInlineClient}
                    disabled={creatingClient || !newClientName.trim()}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                  >
                    {creatingClient ? <Loader2 className="size-4 animate-spin" /> : 'Salvar'}
                  </button>
                </div>
              )}
              {projectClientId === NO_CLIENT && newClientName === null && (
                <input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  maxLength={120}
                  placeholder="Para quem é o link? (opcional)"
                  className="min-h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
                />
              )}
            </div>
            </div>
          </div>
          {projectClientId === NO_CLIENT && (
            <p className="mt-2 text-xs text-muted-foreground">
              Projeto avulso: sem cadastrar cliente. Ao criar, o link da galeria já sai copiado pra você mandar.
            </p>
          )}
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
          {photoError && <p className="mt-2 text-xs text-destructive">{photoError}</p>}
          {createError && <p className="mt-2 text-xs text-destructive">{createError}</p>}
          <button
            type="button"
            onClick={submitProject}
            disabled={creatingBusy}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {creatingBusy && <Loader2 className="size-4 animate-spin" />}
            Criar projeto
          </button>
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
                    className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Novo projeto
                  </button>
                  <Link
                    href="/upload"
                    className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
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
            title={showArchived ? 'Nenhum projeto arquivado' : 'Nenhum projeto encontrado'}
            description={
              showArchived
                ? 'Esse cliente não tem projeto arquivado.'
                : search.trim()
                  ? `Nada encontrado para "${search.trim()}".`
                  : 'Esse cliente não tem nenhum projeto.'
            }
          />
        ) : groups ? (
          <div className="mx-auto flex w-full flex-col gap-6">
            {groups.map((g) => (
              <section key={g.clientId}>
                <div className="mb-3 flex items-center gap-2.5">
                  <ClientAvatar
                    name={g.client?.name ?? AVULSOS}
                    photoUrl={g.client?.photoUrl}
                    seed={g.clientId}
                    size="md"
                  />
                  <h2 className="font-display text-lg text-foreground">
                    {g.client?.name ?? AVULSOS}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {g.projects.length} {g.projects.length === 1 ? 'projeto' : 'projetos'}
                  </span>
                </div>
                <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.projects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      videoCount={countByProject.get(p.id) ?? 0}
                      nextDeadline={nextDeadlineByProject.get(p.id) ?? null}
                      storageReleased={storageReleasedProjects.has(p.id)}
                      archived={showArchived}
                      onUnarchive={() => handleUnarchive(p.id)}
                    />
                  ))}
                </StaggerList>
              </section>
            ))}
          </div>
        ) : (
          <StaggerList className="m-auto grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {searched.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                videoCount={countByProject.get(p.id) ?? 0}
                nextDeadline={nextDeadlineByProject.get(p.id) ?? null}
                storageReleased={storageReleasedProjects.has(p.id)}
                archived={showArchived}
                onUnarchive={() => handleUnarchive(p.id)}
              />
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  )
}

function ProjectCard({
  project,
  videoCount,
  nextDeadline,
  storageReleased,
  archived,
  onUnarchive,
}: {
  project: Project
  videoCount: number
  /** Prazo mais próximo entre as entregas ainda não aprovadas. */
  nextDeadline: string | null
  /** Arquivos de vídeo já apagados (armazenamento liberado). */
  storageReleased: boolean
  archived: boolean
  onUnarchive: () => void
}) {
  const [copied, setCopied] = useState(false)
  const galleryPath = project.publicLink ? `/g/${project.publicLink}` : null
  const clientLabel = project.clientId
    ? (project.client?.name ?? 'Cliente')
    : `Avulso${project.contactName ? ` · ${project.contactName}` : ''}`

  async function copyGalleryLink() {
    if (!galleryPath) return
    try {
      await navigator.clipboard.writeText(publicUrl(galleryPath))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary-ink/50"
    >
      {/* Card inteiro clicável (stretched link) — só o botão de copiar fica acima, com z-index maior. */}
      <Link
        href={`/projetos/${project.id}`}
        aria-label={`Abrir projeto ${project.name}`}
        className="absolute inset-0 z-[1] rounded-2xl"
      />

      {/*
        Só o botão de copiar link precisa ficar acima do link esticado — o
        resto do card (nome, cliente, contagem) fica sem z-index de propósito,
        pra deixar o clique passar direto pro link por baixo.
      */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <ProjectThumb
            photoUrl={project.photoUrl}
            size="sm"
            fallback={
              <ClientAvatar
                name={project.client?.name ?? project.contactName ?? AVULSOS}
                photoUrl={project.client?.photoUrl}
                seed={project.clientId}
              />
            }
          />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground" title={clientLabel}>
              {clientLabel}
            </p>
            <h3 className="mt-1 truncate font-display text-xl font-bold" title={project.name}>
              {project.name}
            </h3>
          </div>
        </div>
        {project.isExample && (
          <span
            title="Projeto de exemplo — explore e delete quando quiser."
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary-ink"
          >
            <Sparkles className="size-3" /> Exemplo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
          {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
        </span>
        {nextDeadline && <DeadlineBadge deadline={nextDeadline} />}
        {storageReleased && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            <HardDrive className="size-3.5" />
            Arquivos removidos
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        {galleryPath && (
          <button
            type="button"
            onClick={copyGalleryLink}
            className="relative z-[2] inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copiado' : 'Copiar link da galeria'}
          </button>
        )}
        {archived && (
          <button
            type="button"
            onClick={onUnarchive}
            className="relative z-[2] inline-flex min-h-9 w-fit items-center justify-center gap-2 rounded-lg border border-primary-ink/40 px-3 text-xs font-medium text-primary-ink transition-colors hover:bg-primary/10"
          >
            <ArchiveRestore className="size-3.5" />
            Desarquivar
          </button>
        )}
      </div>
    </motion.div>
  )
}
