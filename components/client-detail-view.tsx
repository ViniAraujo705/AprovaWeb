'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ImagePlus,
  Loader2,
  Check,
  AlertTriangle,
  Trash2,
  Sparkles,
  FolderOpen,
  Plus,
  X,
  Building2,
  Lock,
  ListPlus,
  CalendarDays,
  CheckCircle2,
  FileVideo,
  History,
  LayoutDashboard,
  Paperclip,
  MessageSquare,
} from 'lucide-react'
import {
  calendarService,
  clientActivityService,
  clientFieldService,
  clientFileService,
  clientService,
  projectService,
  teamService,
  videoService,
} from '@/lib/services'
import type {
  Client,
  ClientActivity,
  ClientActivityType,
  ClientFieldDefinition,
  ClientFile,
  ClientFileCategory,
  Project,
  CalendarActivity,
  TeamMember,
  Video,
} from '@/lib/types'
import { statusLabel } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { validateImageFile, validateClientFile, uploadToPresignedUrl, UploadError } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { FadeIn, AnimatePresence, motion, StaggerList, staggerItem } from '@/components/motion'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { useAuth } from '@/components/auth-provider'

/** Lê um arquivo como Data URL (usado só no preview/modo demo). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

export function ClientDetailView({ id }: { id: string }) {
  const router = useRouter()
  const client = useQuery<Client>((signal) => clientService.get(id, signal), [id])
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function removeClient() {
    await clientService.remove(id)
    toast.success('Cliente excluído')
    router.push('/clientes')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      {client.loading ? (
        <Skeleton className="h-12 w-64" />
      ) : client.error ? (
        <ErrorState message={client.error} onRetry={client.refetch} />
      ) : client.data ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="min-w-0 truncate text-3xl font-bold tracking-tight sm:text-4xl" title={client.data.name}>
                {client.data.name}
              </h1>
              {client.data.isExample && (
                <span
                  title="Cliente de exemplo — explore e delete quando quiser."
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  <Sparkles className="size-3.5" /> Exemplo
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Excluir cliente
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Central de projetos, conteúdos, aprovações, calendário e dados operacionais.</p>

          <ClientWorkspace client={client.data} onUpdated={client.setData} />

          <AnimatePresence>
            {confirmingDelete && (
              <DeleteClientModal
                name={client.data.name}
                onClose={() => setConfirmingDelete(false)}
                onConfirm={removeClient}
              />
            )}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  )
}

type ClientTab = 'overview' | 'projects' | 'content' | 'approvals' | 'calendar' | 'files' | 'history'

const clientTabs: { id: ClientTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'projects', label: 'Projetos', icon: FolderOpen },
  { id: 'content', label: 'Conteúdos', icon: FileVideo },
  { id: 'approvals', label: 'Aprovações', icon: CheckCircle2 },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  { id: 'files', label: 'Arquivos', icon: Paperclip },
  { id: 'history', label: 'Histórico', icon: History },
]

function ClientTabBar({ tab, setTab }: { tab: ClientTab; setTab: (t: ClientTab) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragRange, setDragRange] = useState(0)

  // Mede quanto a faixa de abas excede a largura visível, pra limitar o
  // arrasto (dragConstraints) — recalcula no resize porque em telas largas
  // as 7 abas cabem inteiras e não sobra nada pra arrastar.
  useEffect(() => {
    function measure() {
      const viewport = viewportRef.current
      const track = trackRef.current
      if (!viewport || !track) return
      setDragRange(Math.max(0, track.scrollWidth - viewport.clientWidth))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <div
      ref={viewportRef}
      className="-mx-4 overflow-hidden border-y border-border px-4 sm:mx-0 sm:rounded-xl sm:border sm:px-2"
    >
      <motion.div
        ref={trackRef}
        // Arrasto lateral via Framer Motion em vez de `overflow-x-auto`
        // nativo: essa faixa vive dentro do conteúdo que já rola
        // verticalmente (AgencyShell), e no Safari mobile o navegador
        // entregava o gesto pro scroll vertical da página assim que via
        // qualquer componente vertical no toque (quase inevitável no dedo)
        // — mesmo com `touch-action: pan-x`, o arrasto lateral nunca
        // "vencia" e voltava pro início ao soltar. Um arrasto controlado
        // pelo Framer não depende dessa disputa nativa de eixo (ele lê o
        // gesto por Pointer Events e move a faixa via transform), então
        // funciona igual em qualquer navegador — mesma técnica já usada no
        // swipe dos Reels (`video-stage.tsx`).
        drag={dragRange > 0 ? 'x' : false}
        dragConstraints={{ left: -dragRange, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        className="flex w-max cursor-grab select-none gap-1 py-2 active:cursor-grabbing"
        role="tablist"
        aria-label="Central do cliente"
      >
        {clientTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
              tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </motion.div>
    </div>
  )
}

function ClientWorkspace({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (updater: Client | ((prev: Client | null) => Client)) => void
}) {
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  const [tab, setTab] = useState<ClientTab>('overview')
  const projects = useQuery<Project[]>((signal) => projectService.list(client.id, signal), [client.id])
  const videos = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const events = useQuery<CalendarActivity[]>((signal) => calendarService.list(signal), [])

  const clientVideos = useMemo(() => {
    const projectIds = new Set((projects.data ?? []).map((project) => project.id))
    return (videos.data ?? []).filter((video) => video.projectId !== null && projectIds.has(video.projectId))
  }, [projects.data, videos.data])
  const clientEvents = useMemo(() => (events.data ?? []).filter((event) => event.clientId === client.id), [client.id, events.data])
  const pendingVideos = clientVideos.filter((video) => video.status === 'pendente')
  const approvedVideos = clientVideos.filter((video) => video.status === 'aprovado')
  const changesVideos = clientVideos.filter((video) => video.status === 'ajuste')

  return (
    <div className="mt-8">
      <ClientTabBar tab={tab} setTab={setTab} />

      {tab === 'overview' && (
        <div className="mt-6 space-y-8">
          <ClientMetrics projects={projects.data ?? []} videos={clientVideos} events={clientEvents} />
          <ClientForm client={client} onUpdated={onUpdated} />
          <ClientCustomFieldsForm client={client} onUpdated={onUpdated} />
          {/* Branding por cliente é owner-only na API (PATCH /clients/:id/branding). */}
          {isOwner && <ClientBrandingForm client={client} onUpdated={onUpdated} />}
        </div>
      )}
      {tab === 'projects' && <div className="mt-6"><ClientProjects clientId={client.id} /></div>}
      {tab === 'content' && <ClientVideos videos={clientVideos} loading={projects.loading || videos.loading} error={projects.error ?? videos.error} />}
      {tab === 'approvals' && (
        <div className="mt-6 space-y-6">
          <ClientMetrics projects={[]} videos={clientVideos} events={[]} compact />
          <ClientVideos videos={[...pendingVideos, ...changesVideos, ...approvedVideos]} loading={projects.loading || videos.loading} error={projects.error ?? videos.error} approvalOnly />
        </div>
      )}
      {tab === 'calendar' && <ClientCalendar events={clientEvents} loading={events.loading} error={events.error} />}
      {tab === 'files' && <ClientFiles clientId={client.id} />}
      {tab === 'history' && <ClientHistory clientId={client.id} />}
    </div>
  )
}

function ClientMetrics({ projects, videos, events, compact = false }: { projects: Project[]; videos: Video[]; events: CalendarActivity[]; compact?: boolean }) {
  const items = [
    { label: 'Projetos', value: projects.length, tone: 'text-primary' },
    { label: 'Conteúdos', value: videos.length, tone: 'text-foreground' },
    { label: 'Aguardando aprovação', value: videos.filter((video) => video.status === 'pendente').length, tone: 'text-amber-500' },
    { label: 'Em ajustes', value: videos.filter((video) => video.status === 'ajuste').length, tone: 'text-amber-500' },
    { label: 'Aprovados', value: videos.filter((video) => video.status === 'aprovado').length, tone: 'text-emerald-500' },
    { label: 'Gravações agendadas', value: events.length, tone: 'text-primary' },
  ].filter((item) => !compact || !['Projetos', 'Conteúdos', 'Gravações agendadas'].includes(item.label))
  return <div className="grid gap-3 sm:grid-cols-3">{items.map((item) => <div key={item.label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p><p className={cn('mt-1 text-3xl font-bold tracking-tight', item.tone)}>{item.value}</p></div>)}</div>
}

const statusStyle = { pendente: 'bg-secondary text-muted-foreground', aprovado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', ajuste: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', erro: 'bg-destructive/15 text-destructive' }

function ClientVideos({ videos, loading, error, approvalOnly = false }: { videos: Video[]; loading: boolean; error: string | null; approvalOnly?: boolean }) {
  if (loading) return <div className="mt-6 grid gap-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
  if (error) return <div className="mt-6"><ErrorState message={error} /></div>
  if (videos.length === 0) return <div className="mt-6"><EmptyState icon={<FileVideo className="size-7" />} title={approvalOnly ? 'Nenhuma aprovação para acompanhar' : 'Nenhum conteúdo ainda'} description={approvalOnly ? 'Os conteúdos enviados ao cliente aparecerão aqui conforme avançarem no fluxo.' : 'Envie um vídeo dentro de um projeto para centralizá-lo aqui.'} /></div>
  return <div className="mt-6 space-y-2">{videos.map((video) => <Link key={video.id} href={`/videos/${video.id}/revisao`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"><FileVideo className="size-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate font-medium text-foreground">{video.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{video.commentsCount} comentário{video.commentsCount === 1 ? '' : 's'}{video.deadline ? ` · Prazo: ${new Date(video.deadline).toLocaleDateString('pt-BR')}` : ''}</p></div><span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', statusStyle[video.status])}>{statusLabel[video.status]}</span></Link>)}</div>
}

function ClientCalendar({ events, loading, error }: { events: CalendarActivity[]; loading: boolean; error: string | null }) {
  if (loading) return <div className="mt-6 grid gap-3">{Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
  if (error) return <div className="mt-6"><ErrorState message={error} /></div>
  const ordered = [...events].sort((a, b) => a.startAt.localeCompare(b.startAt))
  if (ordered.length === 0) return <div className="mt-6"><EmptyState icon={<CalendarDays className="size-7" />} title="Nenhuma gravação agendada" description="Os eventos vinculados a este cliente no calendário aparecerão aqui." action={<Link href="/calendario" className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Abrir calendário</Link>} /></div>
  return <div className="mt-6 space-y-2">{ordered.map((event) => <Link key={event.id} href="/calendario" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"><CalendarDays className="size-5 shrink-0 text-primary" /><div className="min-w-0"><p className="font-medium text-foreground">{event.title}</p><p className="text-xs text-muted-foreground">{new Date(event.startAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}{event.notes ? ` · ${event.notes}` : ''}</p></div></Link>)}</div>
}

const clientActivityTypeMeta: Record<ClientActivityType, { icon: typeof History }> = {
  video_enviado: { icon: FileVideo },
  aprovacao_cliente: { icon: CheckCircle2 },
  ajuste_solicitado: { icon: AlertTriangle },
  comentario_cliente: { icon: MessageSquare },
  resposta_agencia: { icon: MessageSquare },
  nova_versao: { icon: FileVideo },
  arquivo_enviado: { icon: Paperclip },
  arquivo_removido: { icon: Trash2 },
  nota_atualizada: { icon: History },
}

function ClientHistory({ clientId }: { clientId: string }) {
  const activity = useQuery<{ items: ClientActivity[]; nextCursor: string | null }>(
    (signal) => clientActivityService.list(clientId, {}, signal),
    [clientId],
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)

  async function loadMore() {
    const cursor = activity.data?.nextCursor
    if (loadingMore || !cursor) return
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const next = await clientActivityService.list(clientId, { cursor })
      activity.setData((prev) => {
        const state = prev ?? { items: [], nextCursor: null }
        return { items: [...state.items, ...next.items], nextCursor: next.nextCursor }
      })
    } catch (err) {
      setLoadMoreError(err instanceof ApiError ? err.message : 'Não foi possível carregar mais atividades.')
    } finally {
      setLoadingMore(false)
    }
  }

  if (activity.loading) return <div className="mt-6"><Skeleton className="h-24 w-full" /></div>
  if (activity.error) return <div className="mt-6"><ErrorState message={activity.error} onRetry={activity.refetch} /></div>
  const items = activity.data?.items ?? []
  if (items.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<History className="size-7" />}
          title="Sem atividade registrada"
          description="Aprovações, ajustes, comentários e envios deste cliente aparecerão aqui."
        />
      </div>
    )
  }
  return (
    <div className="mt-6">
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = clientActivityTypeMeta[item.type].icon
          return (
            <div key={item.id} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-foreground">
                {item.description}
                <span className="text-muted-foreground">
                  {' · '}
                  {new Date(item.createdAt).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })}
                  {item.actorName ? ` · ${item.actorName}` : ''}
                </span>
              </p>
            </div>
          )
        })}
      </div>
      {loadMoreError && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {loadMoreError}
        </p>
      )}
      {activity.data?.nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" />}
            Carregar mais
          </button>
        </div>
      )}
    </div>
  )
}

const clientFileCategoryLabel: Record<ClientFileCategory, string> = {
  briefing: 'Briefing',
  contrato: 'Contrato',
  referencia: 'Referência',
  roteiro: 'Roteiro',
  outro: 'Outro',
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ClientFiles({ clientId }: { clientId: string }) {
  const files = useQuery<ClientFile[]>((signal) => clientFileService.list(clientId, signal), [clientId])
  const inputRef = useRef<HTMLInputElement>(null)

  const [category, setCategory] = useState<ClientFileCategory>('briefing')
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validateClientFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setError(null)
    setBusy(true)
    try {
      // Modo demo: sem R2 de verdade, registra direto com um link fictício.
      if (isDemo()) {
        const created = await clientFileService.create(clientId, {
          fileName: file.name,
          fileUrl: '#',
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          category,
        })
        files.setData((prev) => [created, ...(prev ?? [])])
        toast.success('Arquivo enviado')
        return
      }

      // 1) presigned URL
      const presigned = await clientFileService.getUploadUrl({
        clientId,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')

      // 2) upload direto pro R2
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })

      // 3) registra o arquivo
      const created = await clientFileService.create(clientId, {
        fileName: file.name,
        fileUrl: presigned.publicUrl ?? presigned.key,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        category,
      })
      files.setData((prev) => [created, ...(prev ?? [])])
      toast.success('Arquivo enviado')
    } catch (err) {
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar o arquivo. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function removeFile(fileId: string, fileName: string) {
    const previous = files.data ?? []
    files.setData(previous.filter((f) => f.id !== fileId))
    try {
      await clientFileService.remove(clientId, fileId)
      toast.success('Arquivo removido')
    } catch (err) {
      files.setData(previous)
      toast.error(err instanceof ApiError ? err.message : `Falha ao remover ${fileName}.`)
    }
  }

  return (
    <div className="mt-6">
      <FadeIn y={6}>
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="text-sm font-medium text-foreground">Enviar arquivo</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Briefing, contrato, roteiro ou referência — fica interno, nunca aparece nos links públicos deste cliente.
          </p>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Categoria</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ClientFileCategory)}
              className="min-h-11 w-full max-w-xs rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              {Object.entries(clientFileCategoryLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busy) handleFile(e.dataTransfer.files?.[0])
            }}
            onClick={() => !busy && inputRef.current?.click()}
            className={cn(
              'mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
              busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
              fileError
                ? 'border-destructive/60 bg-destructive/5'
                : dragging
                  ? 'border-primary bg-primary/10'
                  : 'border-primary/50 bg-background hover:border-primary hover:bg-primary/5',
            )}
          >
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
              {busy ? <Loader2 className="size-6 animate-spin" /> : <Paperclip className="size-6" />}
            </span>
            <p className="mt-2 text-sm font-medium text-foreground">
              {busy ? 'Enviando…' : 'Arraste um arquivo ou clique para selecionar'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP ou imagem — até 25MB.
            </p>
          </div>
          {fileError && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {fileError}
            </p>
          )}
          {error && (
            <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" /> {error}
            </p>
          )}
        </div>
      </FadeIn>

      <div className="mt-6">
        {files.loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : files.error ? (
          <ErrorState message={files.error} onRetry={files.refetch} />
        ) : (files.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Paperclip className="size-7" />}
            title="Nenhum arquivo ainda"
            description="Envie briefing, contrato ou roteiro pra centralizar aqui."
          />
        ) : (
          <StaggerList className="space-y-2">
            {(files.data ?? []).map((file) => (
              <motion.div
                key={file.id}
                variants={staggerItem}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
              >
                <Paperclip className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <a
                    href={file.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium text-foreground hover:text-primary"
                    title={file.fileName}
                  >
                    {file.fileName}
                  </a>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {clientFileCategoryLabel[file.category]}
                    {formatFileSize(file.sizeBytes) ? ` · ${formatFileSize(file.sizeBytes)}` : ''}
                    {' · '}
                    {new Date(file.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(file.id, file.fileName)}
                  aria-label={`Remover ${file.fileName}`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </motion.div>
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  )
}

function DeleteClientModal({
  name,
  onClose,
  onConfirm,
}: {
  name: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir o cliente.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5"
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <h3 className="text-lg font-bold tracking-tight">Excluir cliente?</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Isso vai apagar <span className="font-medium text-foreground">{name}</span>, junto com{' '}
          <span className="font-medium text-foreground">todos os projetos, vídeos e comentários</span>{' '}
          associados a ele. Essa ação não pode ser desfeita.
        </p>
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Excluir permanentemente
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function ClientForm({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (updater: Client | ((prev: Client | null) => Client)) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const team = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])

  const [name, setName] = useState(client.name)
  const [description, setDescription] = useState(client.description ?? '')
  const [photoUrl, setPhotoUrl] = useState<string | null>(client.photoUrl)
  const [responsibleId, setResponsibleId] = useState(client.responsibleId ?? '')
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function flashSaved() {
    setSaved(true)
    toast.success('Configuração salva')
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveDetails() {
    setError(null)
    setBusy(true)
    try {
      const updated = await clientService.update(client.id, {
        name: name.trim(),
        description: description.trim() || null,
        responsibleId: responsibleId || null,
      })
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setError(null)
    setBusy(true)
    try {
      // Modo demo: preview local, sem tocar no backend/R2.
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        const updated = await clientService.update(client.id, { photoUrl: dataUrl })
        setPhotoUrl(updated.photoUrl)
        onUpdated(updated)
        flashSaved()
        return
      }

      // 1) presigned URL
      const presigned = await clientService.getPhotoUploadUrl({
        clientId: client.id,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')

      // 2) upload direto pro R2
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })

      // 3) salva a foto no cliente
      const updated = await clientService.update(client.id, { photoUrl: presigned.publicUrl })
      setPhotoUrl(updated.photoUrl)
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar a foto. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setError(null)
    setBusy(true)
    try {
      const updated = await clientService.update(client.id, { photoUrl: null })
      setPhotoUrl(null)
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover a foto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FadeIn y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="text-sm font-medium">Foto de perfil</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Aparece como avatar no modo Reels da tela do cliente. PNG, JPG, SVG ou WEBP até 2MB.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
            {photoUrl ? (
              <Image src={photoUrl} alt="Foto do cliente" fill className="object-cover" sizes="64px" unoptimized />
            ) : (
              <span className="grid h-full w-full place-items-center text-lg font-bold uppercase text-muted-foreground">
                {(name || '?').slice(0, 1)}
              </span>
            )}
          </div>
          {photoUrl && (
            <button
              type="button"
              onClick={removePhoto}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!busy) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={cn(
            'mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            fileError
              ? 'border-destructive/60 bg-destructive/5'
              : dragging
                ? 'border-primary bg-primary/10'
                : 'border-primary/50 bg-background hover:border-primary hover:bg-primary/5',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </span>
          <p className="mt-2 text-sm font-medium text-foreground">
            {busy ? 'Enviando…' : 'Arraste uma foto ou clique para selecionar'}
          </p>
        </div>
        {fileError && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {fileError}
          </p>
        )}

        {/* Nome */}
        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        {/* Responsável */}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Responsável</span>
          <select
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Sem responsável</option>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            Profissional da equipe responsável por este cliente — alimenta a carga de trabalho no dashboard.
          </span>
        </label>

        {/* Descrição / legenda do Reels */}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Legenda no modo Reels</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Gostou do resultado?💛"
            rows={2}
            className="resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">
            Aparece como legenda por cima do vídeo na aba &quot;Preview Reels&quot; que o cliente vê.
          </span>
        </label>

        <button
          type="button"
          onClick={saveDetails}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Salvar
        </button>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            >
              <Check className="size-4" /> Alterações salvas
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}

function ClientCustomFieldsForm({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (updater: Client | ((prev: Client | null) => Client)) => void
}) {
  const fields = useQuery<ClientFieldDefinition[]>((signal) => clientFieldService.list(signal), [])
  const definitions = [...(fields.data ?? [])].sort((a, b) => a.order - b.order)

  const [values, setValues] = useState<Record<string, string>>(client.customFields)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function flashSaved() {
    setSaved(true)
    toast.success('Configuração salva')
    setTimeout(() => setSaved(false), 2000)
  }

  async function save() {
    setError(null)
    setBusy(true)
    try {
      // Remove valores em branco do mapa em vez de mandar string vazia — mantém `customFields` enxuto.
      const cleaned = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''))
      const updated = await clientService.update(client.id, { customFields: cleaned })
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  if (fields.loading) return <Skeleton className="h-40 w-full rounded-2xl" />

  if (definitions.length === 0) {
    return (
      <FadeIn y={6}>
        <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center sm:p-6">
          <ListPlus className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Nenhum campo personalizado configurado
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie campos como Instagram ou CNPJ pra coletar informações extras de cada cliente.
          </p>
          <Link
            href="/configuracoes/campos-cliente"
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
          >
            <Plus className="size-3.5" /> Configurar campos
          </Link>
        </div>
      </FadeIn>
    )
  }

  return (
    <FadeIn y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListPlus className="size-4 text-primary" />
          Campos personalizados
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Definidos em Configurações → Campos de cliente.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {definitions.map((f) => (
            <label key={f.id} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">{f.label}</span>
              <input
                value={values[f.id] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Salvar
        </button>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            >
              <Check className="size-4" /> Alterações salvas
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}

const DEFAULT_ACCENT_COLOR = '#0b0b0d'

function ClientBrandingForm({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (updater: Client | ((prev: Client | null) => Client)) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [logoUrl, setLogoUrl] = useState<string | null>(client.branding?.logoUrl ?? null)
  const [accentColor, setAccentColor] = useState(client.branding?.accentColor ?? DEFAULT_ACCENT_COLOR)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { handlePlanLimitError, planStatus, openUpgradeModal } = usePlanLimit()
  // Enquanto o plano ainda não carregou, não bloqueia (o 403 real continua
  // sendo o backstop) — evita prender a UI atrás de um estado de loading.
  const locked = planStatus ? !planStatus.limits.whiteLabel : false

  function requireUpgrade() {
    openUpgradeModal(
      'Marca própria por cliente (logo e cor de destaque exclusivos dele nos links públicos) é exclusiva dos planos pagos.',
    )
  }

  function flashSaved() {
    setSaved(true)
    toast.success('Configuração salva')
    setTimeout(() => setSaved(false), 2000)
  }

  function applyBranding(branding: { logoUrl: string | null; accentColor: string | null }) {
    onUpdated((prev) => ({
      ...(prev ?? client),
      branding:
        branding.logoUrl || branding.accentColor
          ? { logoUrl: branding.logoUrl, agencyName: null, accentColor: branding.accentColor }
          : null,
    }))
  }

  async function handleFile(file: File | undefined | null) {
    if (locked) {
      requireUpgrade()
      return
    }
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setError(null)
    setBusy(true)
    try {
      // Modo demo: preview local, sem tocar no backend/R2.
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        const branding = await clientService.updateBranding(client.id, { logoUrl: dataUrl })
        setLogoUrl(branding.logoUrl)
        applyBranding(branding)
        flashSaved()
        return
      }

      // 1) presigned URL
      const presigned = await clientService.getBrandingUploadUrl({
        clientId: client.id,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')

      // 2) upload direto pro R2
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })

      // 3) salva o branding do cliente
      const branding = await clientService.updateBranding(client.id, { logoUrl: presigned.publicUrl })
      setLogoUrl(branding.logoUrl)
      applyBranding(branding)
      flashSaved()
    } catch (err) {
      if (handlePlanLimitError(err)) return
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar o logo. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function saveAppearance() {
    if (locked) {
      requireUpgrade()
      return
    }
    setError(null)
    setBusy(true)
    try {
      const nextAccentColor = accentColor === DEFAULT_ACCENT_COLOR ? null : accentColor
      const branding = await clientService.updateBranding(client.id, {
        logoUrl,
        accentColor: nextAccentColor,
      })
      applyBranding(branding)
      flashSaved()
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function removeLogo() {
    setError(null)
    setBusy(true)
    try {
      const branding = await clientService.updateBranding(client.id, { logoUrl: null })
      setLogoUrl(null)
      applyBranding(branding)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover o logo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FadeIn y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="size-4 text-primary" />
          Marca própria deste cliente
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Lock className="size-3" /> Pro
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Opcional. Quando definida, substitui a marca da agência nos links públicos deste cliente
          (galeria de entrega e portfólio marcado pra ele) — logo no topo à esquerda e cor de
          destaque. Deixe em branco pra usar a marca da agência normalmente.
        </p>

        {/* Preview atual */}
        <div className="mt-4 flex items-center gap-4">
          <div className="grid h-16 w-40 place-items-center overflow-hidden rounded-lg border border-border bg-secondary">
            {logoUrl ? (
              <span className="relative h-12 w-36">
                <Image
                  src={logoUrl}
                  alt={`Logo de ${client.name}`}
                  fill
                  className="object-contain"
                  sizes="144px"
                  unoptimized
                />
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Usa a logo da agência</span>
            )}
          </div>
          {logoUrl && (
            <button
              type="button"
              onClick={removeLogo}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!busy && !locked) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (locked) requireUpgrade()
            else if (!busy) handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => {
            if (locked) requireUpgrade()
            else if (!busy) inputRef.current?.click()
          }}
          className={cn(
            'mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            fileError
              ? 'border-destructive/60 bg-destructive/5'
              : dragging
                ? 'border-primary bg-primary/10'
                : 'border-primary/50 bg-background hover:border-primary hover:bg-primary/5',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </span>
          <p className="mt-2 text-sm font-medium text-foreground">
            {busy ? 'Enviando…' : 'Arraste um logo ou clique para selecionar'}
          </p>
        </div>
        {fileError && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {fileError}
          </p>
        )}

        {/* Cor de destaque */}
        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Cor de destaque</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              aria-label="Cor de destaque do cliente"
              className="size-11 cursor-pointer rounded-lg border border-border bg-secondary p-1"
            />
            <input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder={DEFAULT_ACCENT_COLOR}
              className="min-h-11 w-32 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {accentColor !== DEFAULT_ACCENT_COLOR && (
              <button
                type="button"
                onClick={() => setAccentColor(DEFAULT_ACCENT_COLOR)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Usar da agência
              </button>
            )}
          </div>
        </label>

        <button
          type="button"
          onClick={saveAppearance}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Salvar
        </button>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            >
              <Check className="size-4" /> Alterações salvas
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}

function ClientProjects({ clientId }: { clientId: string }) {
  const router = useRouter()
  const projects = useQuery<Project[]>((signal) => projectService.list(clientId, signal), [clientId])

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome do projeto.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await projectService.create({ name: trimmed, clientId })
      toast.success('Projeto criado')
      router.push(`/projetos/${created.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar projeto.')
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl tracking-wide">PROJETOS</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setName('')
              setError(null)
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
          >
            <Plus className="size-3.5" /> Novo projeto
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Novo projeto para este cliente</span>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cancelar"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Reel lançamento batom"
            className="mt-3 min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Criar projeto
          </button>
        </div>
      )}

      <div className="mt-3">
        {projects.loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] w-full" />
            ))}
          </div>
        ) : projects.error ? (
          <ErrorState message={projects.error} onRetry={projects.refetch} />
        ) : (projects.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-7" />}
            title="Nenhum projeto ainda"
            description="Crie um projeto para este cliente para começar a enviar vídeos."
          />
        ) : (
          <StaggerList className="grid gap-3 sm:grid-cols-2">
            {(projects.data ?? []).map((p) => (
              <motion.div key={p.id} variants={staggerItem}>
                <Link
                  href={`/projetos/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <FolderOpen className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 truncate font-medium text-foreground" title={p.name}>
                    {p.name}
                  </span>
                </Link>
              </motion.div>
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  )
}
