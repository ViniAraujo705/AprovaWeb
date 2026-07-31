'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { FolderOpen, Film, Copy, Check, Sparkles, Plus, X, Loader2 } from 'lucide-react'
import { clientService, projectService, videoService } from '@/lib/services'
import type { Client, Project, Video } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion } from '@/components/motion'
import { toast } from '@/lib/toast'

const ALL_CLIENTS = 'Todos os clientes'

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

  const allProjects = projects.data ?? []
  const clientNames = useMemo(() => {
    const set = new Set<string>()
    allProjects.forEach((p) => p.client?.name && set.add(p.client.name))
    return [ALL_CLIENTS, ...Array.from(set).sort()]
  }, [allProjects])

  const filtered = allProjects.filter(
    (p) => client === ALL_CLIENTS || p.client?.name === client,
  )

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
        <div className="flex shrink-0 items-center gap-3">
          {allProjects.length > 0 && (
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
        ) : filtered.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            title="Nenhum projeto encontrado"
            description="Esse cliente não tem nenhum projeto."
          />
        ) : (
          <StaggerList className="m-auto grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} videoCount={countByProject.get(p.id) ?? 0} />
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project, videoCount }: { project: Project; videoCount: number }) {
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
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground" title={project.client?.name ?? 'Cliente'}>
            {project.client?.name ?? 'Cliente'}
          </p>
          <h3 className="mt-0.5 truncate text-lg font-bold tracking-tight" title={project.name}>
            {project.name}
          </h3>
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

      {galleryPath && (
        <button
          type="button"
          onClick={copyGalleryLink}
          className="relative z-[2] mt-1 inline-flex min-h-9 w-fit items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copiado' : 'Copiar link da galeria'}
        </button>
      )}
    </motion.div>
  )
}
