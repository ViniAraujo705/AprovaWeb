'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownUp, Clock, Contact, Film, FolderOpen, Loader2, Plus, Sparkles, UserPlus, X } from 'lucide-react'
import { clientService, projectService, videoService } from '@/lib/services'
import type { Client, Project, Video } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion } from '@/components/motion'
import { toast } from '@/lib/toast'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { ClientAvatar } from '@/components/client-avatar'
import { PageHeader } from '@/components/page-header'
import { formatSentAtCompact, getDeadlineUrgency } from '@/lib/format'
import {
  FilterMenu,
  ListHeader,
  SearchField,
  StatusTabs,
  ViewToggle,
  useViewMode,
  type TabItem,
} from '@/components/collection-controls'

type ClientTab = 'todos' | 'ativos' | 'atrasados' | 'sem-projetos'
type ClientSort = 'nome' | 'recentes' | 'projetos'

/** Números de cada cliente, cruzando projetos e vídeos (a API de clientes não traz contagem). */
type ClientStats = {
  projects: number
  activeProjects: number
  videos: number
  /** Versões atuais esperando o cliente (pendente) ou voltando pra equipe (ajuste). */
  awaiting: number
  overdue: number
  lastActivity: string | null
}

const EMPTY_STATS: ClientStats = { projects: 0, activeProjects: 0, videos: 0, awaiting: 0, overdue: 0, lastActivity: null }

const CLIENT_LIST_COLS = 'md:grid-cols-[minmax(0,2fr)_90px_80px_150px_130px]'

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Lista de clientes (rota /clientes) — cada card leva ao detalhe do cliente
 * (`/clientes/[id]`), onde o owner configura nome, a legenda do modo Reels e
 * a foto de perfil. Mesmo padrão de Projetos: abas por situação, grade/lista,
 * busca e ordenação, pensado pra continuar organizado com muitos clientes.
 */
export function ClientsView() {
  const router = useRouter()
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const projects = useQuery<Project[]>((signal) => projectService.list(undefined, signal), [])
  const videos = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const { handlePlanLimitError, bumpUsage } = usePlanLimit()

  const [tab, setTab] = useState<ClientTab>('todos')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ClientSort>('nome')
  const [view, setView] = useViewMode('check:clientes-visao')

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openForm() {
    setCreating(true)
    setName('')
    setError(null)
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome do cliente.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await clientService.create({ name: trimmed })
      clients.setData((prev) => [...(prev ?? []), created])
      bumpUsage({ clients: 1 })
      setCreating(false)
      toast.success('Cliente criado')
      router.push(`/clientes/${created.id}`)
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setError(err instanceof ApiError ? err.message : 'Falha ao criar cliente.')
    } finally {
      setBusy(false)
    }
  }

  const allClients = clients.data ?? []

  const statsByClient = useMemo(() => {
    const map = new Map<string, ClientStats>()
    const get = (id: string) => {
      if (!map.has(id)) map.set(id, { ...EMPTY_STATS })
      return map.get(id)!
    }
    const projectClient = new Map<string, string>()
    for (const p of projects.data ?? []) {
      if (!p.clientId) continue
      projectClient.set(p.id, p.clientId)
      get(p.clientId).projects++
      const created = p.createdAt ?? null
      const s = get(p.clientId)
      if (created && (!s.lastActivity || created > s.lastActivity)) s.lastActivity = created
    }
    // Vídeo sem projeto cai no cliente pelo nome (a listagem de vídeos não traz clientId).
    const clientIdByName = new Map((clients.data ?? []).map((c) => [c.name, c.id]))
    const unfinishedProjects = new Set<string>()
    for (const v of videos.data ?? []) {
      const clientId = (v.projectId && projectClient.get(v.projectId)) || clientIdByName.get(v.clientName)
      if (!clientId) continue
      const s = get(clientId)
      if (v.createdAt && (!s.lastActivity || v.createdAt > s.lastActivity)) s.lastActivity = v.createdAt
      if (v.latestVersionId !== v.id) continue
      s.videos++
      if (v.status === 'pendente' || v.status === 'ajuste') s.awaiting++
      if (v.status !== 'aprovado') {
        if (v.projectId) unfinishedProjects.add(v.projectId)
        if (getDeadlineUrgency(v.deadline) === 'overdue') s.overdue++
      }
    }
    // Projeto ativo = ainda tem vídeo não aprovado, ou foi criado e ainda não recebeu vídeo.
    const projectsWithVideo = new Set((videos.data ?? []).map((v) => v.projectId).filter(Boolean))
    for (const p of projects.data ?? []) {
      if (!p.clientId) continue
      if (unfinishedProjects.has(p.id) || !projectsWithVideo.has(p.id)) get(p.clientId).activeProjects++
    }
    return map
  }, [clients.data, projects.data, videos.data])

  const statsOf = (c: Client) => statsByClient.get(c.id) ?? EMPTY_STATS

  const counts = {
    todos: allClients.length,
    ativos: allClients.filter((c) => statsOf(c).activeProjects > 0).length,
    atrasados: allClients.filter((c) => statsOf(c).overdue > 0).length,
    'sem-projetos': allClients.filter((c) => statsOf(c).activeProjects === 0).length,
  }
  const tabs: TabItem<ClientTab>[] = [
    { key: 'todos', label: 'Todos', count: counts.todos },
    { key: 'ativos', label: 'Com projeto ativo', count: counts.ativos },
    { key: 'atrasados', label: 'Com atraso', count: counts.atrasados, tone: 'danger' },
    { key: 'sem-projetos', label: 'Sem projeto ativo', count: counts['sem-projetos'] },
  ]

  const visibleClients = useMemo(() => {
    const q = normalize(search.trim())
    const list = allClients.filter((c) => {
      const s = statsOf(c)
      if (tab === 'ativos' && s.activeProjects === 0) return false
      if (tab === 'atrasados' && s.overdue === 0) return false
      if (tab === 'sem-projetos' && s.activeProjects > 0) return false
      return !q || normalize(c.name).includes(q) || normalize(c.email ?? '').includes(q)
    })
    const byName = (a: Client, b: Client) => a.name.localeCompare(b.name, 'pt-BR')
    if (sort === 'recentes')
      return [...list].sort((a, b) => (statsOf(b).lastActivity ?? '').localeCompare(statsOf(a).lastActivity ?? '') || byName(a, b))
    if (sort === 'projetos') return [...list].sort((a, b) => statsOf(b).projects - statsOf(a).projects || byName(a, b))
    return [...list].sort(byName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClients, statsByClient, tab, search, sort])

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Carteira da agência"
        title="Clientes"
        description="Quem você atende, o que está em andamento com cada um e o que está esperando retorno."
        actions={
          <button
            type="button"
            onClick={openForm}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-display text-base text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Novo cliente
          </button>
        }
      />

      {allClients.length > 0 && (
        <>
          <StatusTabs tabs={tabs} value={tab} onChange={setTab} className="mt-8" />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar cliente"
              className="w-full sm:w-auto sm:min-w-56 sm:max-w-sm sm:flex-1"
            />
            <FilterMenu
              icon={<ArrowDownUp className="size-4" />}
              label="Ordenar"
              value={sort}
              options={[
                { value: 'nome', label: 'Nome (A–Z)' },
                { value: 'recentes', label: 'Atividade recente' },
                { value: 'projetos', label: 'Mais projetos' },
              ]}
              onChange={(v) => setSort(v as ClientSort)}
            />
            <div className="ml-auto">
              <ViewToggle value={view} onChange={setView} />
            </div>
          </div>
        </>
      )}

      {creating && (
        <NewClientDialog
          name={name}
          onName={(v) => {
            setName(v)
            setError(null)
          }}
          busy={busy}
          error={error}
          onSubmit={submit}
          onClose={() => !busy && setCreating(false)}
        />
      )}

      <div className="mt-6 flex flex-1 flex-col">
        {clients.loading ? (
          <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-[16px]" />
            ))}
          </div>
        ) : clients.error ? (
          <ErrorState className="m-auto w-full" message={clients.error} onRetry={clients.refetch} />
        ) : allClients.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            icon={<Contact className="size-7" />}
            title="Nenhum cliente ainda"
            description="Crie um cliente para depois organizar os projetos e vídeos dele."
            action={
              <button
                type="button"
                onClick={openForm}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Novo cliente
              </button>
            }
          />
        ) : visibleClients.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            icon={<Contact className="size-7" />}
            title="Nenhum cliente encontrado"
            description={search.trim() ? `Nada encontrado para "${search.trim()}" nesta aba.` : 'Nenhum cliente nesta aba.'}
          />
        ) : view === 'grid' ? (
          <StaggerList className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleClients.map((c) => (
              <ClientGridCard key={c.id} client={c} stats={statsOf(c)} />
            ))}
          </StaggerList>
        ) : (
          <div className="w-full">
            <ListHeader cols={CLIENT_LIST_COLS}>
              <span>Cliente</span>
              <span>Projetos</span>
              <span>Vídeos</span>
              <span>Situação</span>
              <span>Última atividade</span>
            </ListHeader>
            <StaggerList className="flex flex-col">
              {visibleClients.map((c) => (
                <ClientListRow key={c.id} client={c} stats={statsOf(c)} />
              ))}
            </StaggerList>
          </div>
        )}
      </div>
    </div>
  )
}

/** O que mais pede atenção no cliente, numa etiqueta só. */
function ClientStatusBadge({ stats }: { stats: ClientStats }) {
  if (stats.overdue > 0)
    return (
      <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-[6px] bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-ink">
        <AlertTriangle className="size-3" />
        {stats.overdue} atrasado{stats.overdue === 1 ? '' : 's'}
      </span>
    )
  if (stats.awaiting > 0)
    return (
      <span className="inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-[6px] bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">
        <Clock className="size-3" />
        {stats.awaiting} aguardando
      </span>
    )
  if (stats.activeProjects > 0)
    return (
      <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
        <span className="size-1.5 rounded-full bg-current" />
        Em andamento
      </span>
    )
  return <span className="text-xs text-muted-foreground">Sem projeto ativo</span>
}

function ExampleTag() {
  return (
    <span
      title="Cliente de exemplo — explore e delete quando quiser."
      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary-ink"
    >
      <Sparkles className="size-3" /> Exemplo
    </span>
  )
}

function ClientGridCard({ client, stats }: { client: Client; stats: ClientStats }) {
  const accent = client.branding?.accentColor ?? null
  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex flex-col overflow-hidden rounded-[16px] border border-border bg-card transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg"
    >
      <Link href={`/clientes/${client.id}`} aria-label={`Abrir cliente ${client.name}`} className="absolute inset-0 z-[1]" />
      {/* Faixa no topo com a cor da marca do cliente (quando definida). */}
      <div
        className="h-14 w-full bg-gradient-to-br from-secondary to-muted"
        style={accent ? { background: `linear-gradient(135deg, ${accent}33, ${accent}11)` } : undefined}
      />
      <div className="-mt-8 flex flex-1 flex-col px-4 pb-4">
        <span className="w-fit rounded-full ring-4 ring-card">
          <ClientAvatar name={client.name || '?'} photoUrl={client.photoUrl} seed={client.id} size="xl" />
        </span>
        <div className="mt-2.5 flex min-w-0 items-center gap-1.5">
          <h3 className="truncate font-display text-base font-bold text-foreground" title={client.name}>
            {client.name}
          </h3>
          {client.isExample && <ExampleTag />}
        </div>
        <p className="truncate text-xs text-muted-foreground" title={client.email}>
          {client.email || 'Sem e-mail'}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <FolderOpen className="size-3.5" />
            {stats.projects} {stats.projects === 1 ? 'projeto' : 'projetos'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Film className="size-3.5" />
            {stats.videos} {stats.videos === 1 ? 'vídeo' : 'vídeos'}
          </span>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <ClientStatusBadge stats={stats} />
        </div>
      </div>
    </motion.div>
  )
}

function ClientListRow({ client, stats }: { client: Client; stats: ClientStats }) {
  return (
    <motion.div
      variants={staggerItem}
      className={`group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-border px-4 py-3 transition-colors hover:bg-secondary/50 ${CLIENT_LIST_COLS}`}
    >
      <Link href={`/clientes/${client.id}`} aria-label={`Abrir cliente ${client.name}`} className="absolute inset-0 z-[1]" />
      <div className="flex min-w-0 items-center gap-3">
        <ClientAvatar name={client.name || '?'} photoUrl={client.photoUrl} seed={client.id} size="lg" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground" title={client.name}>
              {client.name}
            </p>
            {client.isExample && <ExampleTag />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="md:hidden">
              {stats.projects} {stats.projects === 1 ? 'projeto' : 'projetos'} · {stats.videos}{' '}
              {stats.videos === 1 ? 'vídeo' : 'vídeos'}
            </span>
            <span className="hidden md:inline">{client.email || 'Sem e-mail'}</span>
          </p>
        </div>
      </div>
      <span className="hidden text-sm tabular-nums text-muted-foreground md:block">{stats.projects}</span>
      <span className="hidden text-sm tabular-nums text-muted-foreground md:block">{stats.videos}</span>
      <span className="justify-self-end md:justify-self-start">
        <ClientStatusBadge stats={stats} />
      </span>
      <span className="hidden truncate text-sm text-muted-foreground md:block">
        {stats.lastActivity ? formatSentAtCompact(stats.lastActivity) : '—'}
      </span>
    </motion.div>
  )
}

function NewClientDialog({
  name,
  onName,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  name: string
  onName: (v: string) => void
  busy: boolean
  error: string | null
  onSubmit: () => void
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center sm:p-4">
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-cliente-title"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="relative w-full overflow-hidden rounded-t-[20px] border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-[20px]"
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-3.5 px-6 pt-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary/25 text-primary-ink">
            <UserPlus className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="novo-cliente-title" className="font-display text-xl font-bold leading-tight text-foreground">
              Novo cliente
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Foto, marca e e-mail você completa depois.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 px-6 py-6">
          <label htmlFor="novo-cliente-nome" className="text-sm font-medium text-foreground">
            Nome do cliente
          </label>
          <input
            id="novo-cliente-nome"
            autoFocus
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Ex: Bela Cosméticos"
            className="h-11 w-full rounded-[10px] border border-border bg-transparent px-3.5 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-primary-ink focus:ring-[3px] focus:ring-primary/25"
          />
          {error && (
            <p className="mt-2 rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Criar cliente
          </button>
        </div>
      </motion.form>
    </div>
  )
}
