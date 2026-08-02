'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
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

const ALL_CLIENTS = 'Todos os clientes'

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
  const projects = useQuery<Project[]>((signal) => projectService.list(undefined, signal), [])
  // Buscado à parte só para contar quantos vídeos cada projeto tem — o
  // hand-rolled useQuery não faz join, então dois fetches independentes.
  const videos = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])

  const [client, setClient] = useState(ALL_CLIENTS)
  const [search, setSearch] = useState('')

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
  const [creatingClient, setCreatingClient] = useState(false)
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function openProjectForm() {
    setCreatingProject(true)
    setProjectName('')
    setProjectClientId('')
    setNewClientName(null)
    setCreateError(null)
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
      setCreateError('Selecione um cliente.')
      return
    }
    setCreatingBusy(true)
    setCreateError(null)
    try {
      const created = await projectService.create({ name, clientId: projectClientId })
      toast.success('Projeto criado')
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
    return [ALL_CLIENTS, ...Array.from(set).sort()]
  }, [allProjects])

  const archivedCount = allProjects.filter((p) => archivedIds.includes(p.id)).length
  const visibleProjects = allProjects.filter((p) =>
    showArchived ? archivedIds.includes(p.id) : !archivedIds.includes(p.id),
  )

  const filtered = visibleProjects.filter(
    (p) => client === ALL_CLIENTS || p.client?.name === client,
  )

  const searched = useMemo(() => {
    const q = normalize(search.trim())
    if (!q) return filtered
    return filtered.filter(
      (p) => normalize(p.name).includes(q) || normalize(p.client?.name ?? '').includes(q),
    )
  }, [filtered, search])

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
    return Array.from(map.values()).sort((a, b) =>
      (a.client?.name ?? 'Sem cliente').localeCompare(b.client?.name ?? 'Sem cliente', 'pt-BR'),
    )
  }, [searched, client])

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">PROJETOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada projeto agrupa os vídeos de uma entrega — mande o link da galeria pro cliente ver
            todos de uma vez.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {allProjects.length > 0 && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar projeto ou cliente..."
                  className="min-h-11 w-56 rounded-lg border border-border bg-secondary py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
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
            </>
          )}
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors ${
                showArchived
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-secondary text-foreground hover:bg-secondary/70'
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
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
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
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Nome do projeto (ex: Reel lançamento batom)"
              className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                {newClientName === null ? (
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
                )}
              </div>
              {newClientName === null ? (
                <select
                  value={projectClientId}
                  onChange={(e) => setProjectClientId(e.target.value)}
                  disabled={clients.loading}
                  className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="" disabled>
                    {clients.loading ? 'Carregando…' : 'Selecione o cliente'}
                  </option>
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
                    className="min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
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
            </div>
          </div>
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
            title="Nenhum projeto ainda"
            description="Crie um projeto para um cliente, ou envie o primeiro vídeo direto."
            action={
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
                    name={g.client?.name ?? 'Sem cliente'}
                    photoUrl={g.client?.photoUrl}
                    seed={g.clientId}
                    size="sm"
                  />
                  <h2 className="text-sm font-semibold text-foreground">
                    {g.client?.name ?? 'Sem cliente'}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {g.projects.length} {g.projects.length === 1 ? 'projeto' : 'projetos'}
                  </span>
                </div>
                <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.projects.map((p) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      videoCount={countByProject.get(p.id) ?? 0}
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
  archived,
  onUnarchive,
}: {
  project: Project
  videoCount: number
  archived: boolean
  onUnarchive: () => void
}) {
  const [copied, setCopied] = useState(false)
  const galleryPath = project.publicLink ? `/g/${project.publicLink}` : null

  async function copyGalleryLink() {
    if (!galleryPath) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${galleryPath}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      {/* Card inteiro clicável (stretched link) — só o botão de copiar fica acima, com z-index maior. */}
      <Link
        href={`/projetos/${project.id}`}
        aria-label={`Abrir projeto ${project.name}`}
        className="absolute inset-0 z-[1] rounded-xl"
      />

      {/*
        Só o botão de copiar link precisa ficar acima do link esticado — o
        resto do card (nome, cliente, contagem) fica sem z-index de propósito,
        pra deixar o clique passar direto pro link por baixo.
      */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <ClientAvatar
            name={project.client?.name ?? 'Cliente'}
            photoUrl={project.client?.photoUrl}
            seed={project.clientId}
          />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground" title={project.client?.name ?? 'Cliente'}>
              {project.client?.name ?? 'Cliente'}
            </p>
            <h3 className="mt-0.5 truncate text-lg font-bold tracking-tight" title={project.name}>
              {project.name}
            </h3>
          </div>
        </div>
        {project.isExample && (
          <span
            title="Projeto de exemplo — explore e delete quando quiser."
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
          >
            <Sparkles className="size-3" /> Exemplo
          </span>
        )}
      </div>

      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
        <Film className="size-3.5" />
        {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
      </span>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        {galleryPath && (
          <button
            type="button"
            onClick={copyGalleryLink}
            className="relative z-[2] inline-flex min-h-9 w-fit items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copiado' : 'Copiar link da galeria'}
          </button>
        )}
        {archived && (
          <button
            type="button"
            onClick={onUnarchive}
            className="relative z-[2] inline-flex min-h-9 w-fit items-center justify-center gap-2 rounded-lg border border-primary/40 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <ArchiveRestore className="size-3.5" />
            Desarquivar
          </button>
        )}
      </div>
    </motion.div>
  )
}
