'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  UploadCloud,
  Film,
  Link2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Plus,
  X,
  RotateCcw,
  Info,
} from 'lucide-react'
import { clientService, demandService, projectService, teamService, videoService } from '@/lib/services'
import type { Client, Project, TeamMember } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { Skeleton } from '@/components/states'
import { ApiError } from '@/lib/api'
import { UploadError, uploadToPresignedUrl, validateVideoFile } from '@/lib/upload'
import { UPLOAD_ACCEPTED_LABEL } from '@/lib/config'
import { DEMO_LINK, isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { DateField } from '@/components/date-field'

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error'

interface PendingFile {
  id: string
  file: File
  /** Nome de exibição do vídeo, editável — pré-preenchido com o nome do arquivo sem extensão. */
  name: string
  status: ItemStatus
  progress: number
  error?: string
  /** Velocidade média (bytes/s) e ETA do envio em andamento — só enquanto `status === 'uploading'`. */
  speedBps?: number
  etaSeconds?: number | null
  /** Miniatura local extraída do vídeo antes do upload. */
  thumbnailUrl: string | null
  thumbnailLoading: boolean
}

/** Formata bytes/s como "3,2 MB/s" (ou KB/s para uploads lentos/no início). */
function formatSpeed(bytesPerSecond: number): string {
  const mbps = bytesPerSecond / (1024 * 1024)
  if (mbps >= 0.1) return `${mbps.toFixed(1)} MB/s`
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s restantes`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} min restantes`
}

/** Extrai um frame pequeno do arquivo local para facilitar a identificação no lote. */
function createVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    let finished = false
    const timeout = window.setTimeout(() => finish(null), 5000)

    function finish(thumbnail: string | null) {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
      resolve(thumbnail)
    }

    function capture() {
      if (!video.videoWidth || !video.videoHeight) return finish(null)
      const maxWidth = 160
      const width = Math.min(maxWidth, video.videoWidth)
      const height = Math.max(1, Math.round((width / video.videoWidth) * video.videoHeight))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return finish(null)
      context.drawImage(video, 0, 0, width, height)
      try {
        finish(canvas.toDataURL('image/jpeg', 0.82))
      } catch {
        finish(null)
      }
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.onloadeddata = () => {
      const frameTime = Math.min(0.1, Math.max(0, (video.duration || 0) / 2))
      if (frameTime > 0) {
        video.onseeked = capture
        video.currentTime = frameTime
      } else {
        capture()
      }
    }
    video.onerror = () => finish(null)
    video.src = objectUrl
  })
}

/** 'submitting' cobre tanto o upload pro R2 quanto o registro no backend de cada arquivo. */
type Phase = 'idle' | 'submitting' | 'done'

function VideoThumbnail({ item }: { item: PendingFile }) {
  return (
    <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
      ) : item.thumbnailLoading ? (
        <Loader2 className="size-5 animate-spin" aria-label="Gerando miniatura" />
      ) : (
        <Film className="size-5" aria-label="Miniatura indisponível" />
      )}
      {item.status === 'done' && (
        <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="size-3" />
        </span>
      )}
      {item.status === 'error' && (
        <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-destructive text-destructive-foreground">
          <AlertTriangle className="size-3" />
        </span>
      )}
    </span>
  )
}

export function UploadView() {
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const members = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const { handlePlanLimitError, bumpUsage } = usePlanLimit()
  const assignableMembers = (members.data ?? []).filter((m) => m.status === 'active')
  // Editor responsável pelo lote inteiro — atribuído a cada vídeo após criado.
  const [editorId, setEditorId] = useState('')
  // Prazo de entrega do lote inteiro (YYYY-MM-DD) — aplicado a cada vídeo
  // após criado, igual ao editor. Opcional.
  const [deadline, setDeadline] = useState('')

  const [dragging, setDragging] = useState(false)
  // true entre o clique que abre o seletor de arquivos e o `change` do
  // <input>. No iPhone, escolher vídeos da galeria pode levar vários
  // segundos (export do iCloud / transcode de HEVC) *antes* do change
  // disparar — nesse intervalo nenhum JS roda, então esse estado precisa
  // ser ligado no clique (antes do picker abrir) pra já estar pintado na
  // tela quando o controle voltar pra página, e não só depois.
  const [selecting, setSelecting] = useState(false)
  const [items, setItems] = useState<PendingFile[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string
    client?: string
    project?: string
  }>({})

  // Vídeo pertence a um projeto: por padrão cria um novo, mas o owner/editor
  // pode escolher um projeto já existente do cliente para agrupar a entrega
  // (ex.: vários vídeos do mesmo lote aparecendo juntos na galeria pública).
  // Cliente/projeto são configurados uma vez só e valem pro lote inteiro.
  const [projectMode, setProjectMode] = useState<'novo' | 'existente'>('novo')
  const [projectId, setProjectId] = useState('')
  const projectsForClient = useQuery<Project[]>(
    (signal) => projectService.list(clientId, signal),
    [clientId],
    { enabled: projectMode === 'existente' && !!clientId },
  )

  // Chegando com `?projectId=` (botão "Novo vídeo" na tela do projeto):
  // trava cliente + projeto naquele projeto específico (não dá pra trocar de
  // cliente/projeto nem criar um novo por aqui) e já herda o editor
  // responsável do projeto, se houver um.
  const searchParams = useSearchParams()
  const prefillProjectId = searchParams.get('projectId')
  const [prefilledProject, setPrefilledProject] = useState<Project | null>(null)
  const [prefillLoading, setPrefillLoading] = useState(!!prefillProjectId)
  useEffect(() => {
    if (!prefillProjectId) return
    let cancelled = false
    projectService
      .get(prefillProjectId)
      .then((project) => {
        if (cancelled) return
        setClientId(project.clientId)
        setProjectMode('existente')
        setProjectId(project.id)
        setPrefilledProject(project)
        const projectEditor = project.members?.[0]
        if (projectEditor) setEditorId(projectEditor.userId)
      })
      .catch(() => {
        // Link inválido/projeto removido: sem problema, o form abre no
        // fluxo padrão (criar novo projeto) em vez de travar a tela.
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [prefillProjectId])

  const [phase, setPhase] = useState<Phase>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Guardado após o primeiro envio do lote, pra "tentar novamente" reaproveitar
  // o mesmo projeto em vez de criar um novo a cada tentativa.
  const [batchProjectId, setBatchProjectId] = useState<string | null>(null)
  // Um lote inteiro é uma única demanda operacional no Kanban. Guardar o id
  // evita duplicá-la quando o usuário tenta novamente arquivos que falharam.
  const [batchDemandId, setBatchDemandId] = useState<string | null>(null)
  const [galleryLink, setGalleryLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Criação inline de cliente (CRUD create).
  const [newClient, setNewClient] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)

  // 'cancel' não faz parte do typing do React p/ <input>; escuta nativamente.
  // Dispara quando o usuário fecha o seletor de arquivos sem escolher nada.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onCancel = () => setSelecting(false)
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [])

  // Nem todo browser dispara 'cancel' de forma confiável (Safari em especial),
  // e o próprio click() do input pode falhar em abrir o seletor silenciosamente
  // (ex.: gesto de clique "consumido" logo após fechar o menu lateral). Sem uma
  // saída de emergência esse estado trava pra sempre — só um reload resolvia.
  useEffect(() => {
    if (!selecting) return
    const timeout = setTimeout(() => setSelecting(false), 15000)
    return () => clearTimeout(timeout)
  }, [selecting])

  function addFiles(fileList: FileList | File[] | null | undefined) {
    setSelecting(false)
    if (!fileList) return
    const files = Array.from(fileList)
    if (files.length === 0) return

    const rejected: string[] = []
    const accepted: PendingFile[] = []
    for (const f of files) {
      const err = validateVideoFile(f)
      if (err) rejected.push(`${f.name}: ${err}`)
      else
        accepted.push({
          id: String(nextId.current++),
          file: f,
          name: f.name.replace(/\.[^.]+$/, ''),
          status: 'pending',
          progress: 0,
          thumbnailUrl: null,
          thumbnailLoading: true,
        })
    }
    setFileError(rejected.length > 0 ? rejected.join('; ') : null)
    if (accepted.length === 0) return

    setItems((prev) => [...prev, ...accepted])
    if (!title.trim()) setTitle(accepted[0].file.name.replace(/\.[^.]+$/, ''))

    for (const item of accepted) {
      void createVideoThumbnail(item.file).then((thumbnailUrl) =>
        updateItem(item.id, { thumbnailUrl, thumbnailLoading: false }),
      )
    }
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function updateItem(id: string, patch: Partial<PendingFile>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }

  async function createClient() {
    const name = (newClient ?? '').trim()
    if (!name) return
    setCreatingClient(true)
    try {
      const created = await clientService.create({ name })
      clients.setData((prev) => [...(prev ?? []), created])
      bumpUsage({ clients: 1 })
      setClientId(created.id)
      // Cliente recém-criado não tem nenhum projeto ainda.
      setProjectMode('novo')
      setProjectId('')
      setNewClient(null)
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setSubmitError(err instanceof ApiError ? err.message : 'Falha ao criar cliente.')
    } finally {
      setCreatingClient(false)
    }
  }

  function validate() {
    const next: { title?: string; client?: string; project?: string } = {}
    if (!clientId) next.client = 'Selecione um cliente.'
    if (projectMode === 'novo') {
      if (!title.trim()) next.title = 'Informe o nome do projeto.'
    } else if (!projectId) {
      next.project = 'Selecione um projeto.'
    }
    setFieldErrors(next)
    if (items.length === 0) setFileError('Selecione ao menos um vídeo para enviar.')
    return Object.keys(next).length === 0 && items.length > 0
  }

  /** Sobe cada item pendente/com erro pro R2 e registra no backend, um de cada vez. */
  async function uploadPending(targetProjectId: string) {
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'error')
    for (const item of pending) {
      updateItem(item.id, { status: 'uploading', progress: 0, error: undefined })
      try {
        const presigned = await videoService.getUploadUrl({
          fileName: item.file.name,
          contentType: item.file.type || 'application/octet-stream',
        })
        if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
        if (!presigned.publicUrl)
          throw new UploadError('Servidor não retornou a URL pública do arquivo.')

        await uploadToPresignedUrl({
          url: presigned.uploadUrl,
          file: item.file,
          headers: presigned.headers,
          onProgress: (p, info) =>
            updateItem(item.id, {
              progress: p,
              speedBps: info.bytesPerSecond,
              etaSeconds: info.etaSeconds,
            }),
        })

        const created = await videoService.create({
          projectId: targetProjectId,
          urlStorage: presigned.publicUrl,
          nomeArquivo: item.name.trim() || item.file.name,
        })
        bumpUsage({ videosThisMonth: 1 })

        if (editorId) {
          // Falha em atribuir o editor não deve derrubar o upload em si —
          // o vídeo já foi criado com sucesso.
          await videoService.assignEditor(created.id, editorId).catch(() => {})
        }

        if (deadline) {
          const isoDeadline = new Date(`${deadline}T00:00:00`).toISOString()
          await videoService.updateDeadline(created.id, isoDeadline).catch(() => {})
        }

        updateItem(item.id, { status: 'done', progress: 100 })
      } catch (err) {
        const message =
          err instanceof UploadError
            ? err.message
            : err instanceof ApiError
              ? err.message
              : err instanceof DOMException && err.name === 'AbortError'
                ? 'Upload cancelado.'
                : 'Falha inesperada no envio.'
        updateItem(item.id, { status: 'error', error: message })
        // Teto mensal de vídeos atingido: não adianta tentar os arquivos
        // seguintes do mesmo lote, o limite não muda entre um e outro.
        if (handlePlanLimitError(err)) break
      }
    }
  }

  async function createBatchDemand(projectName: string) {
    if (batchDemandId) return
    const created = await demandService.create({
      title: `Entrega de vídeos — ${projectName}`,
      kind: 'demanda',
      clientId,
      responsibleId: editorId || null,
      deadline: deadline ? new Date(`${deadline}T00:00:00`).toISOString() : null,
    })
    setBatchDemandId(created.id)
  }

  async function handleSubmit() {
    setSubmitError(null)
    if (!validate()) return

    setPhase('submitting')

    // Modo demo: simula o upload sem tocar no backend/R2.
    if (isDemo()) {
      for (const item of items.filter((i) => i.status === 'pending')) {
        updateItem(item.id, { status: 'uploading', progress: 0 })
        for (let p = 20; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 80))
          updateItem(item.id, { progress: p })
        }
        updateItem(item.id, { status: 'done' })
      }
      await createBatchDemand(title.trim() || 'Novo lote')
      await new Promise((r) => setTimeout(r, 300))
      setGalleryLink(`${window.location.origin}/v/${DEMO_LINK}`)
      setPhase('done')
      return
    }

    try {
      // O vídeo pertence a um projeto (não direto a um cliente) — cria um
      // projeto novo com o nome informado, ou reaproveita um já existente do
      // cliente, uma única vez pro lote inteiro.
      let targetProjectId = batchProjectId
      let projectName = title.trim()
      if (!targetProjectId) {
        if (projectMode === 'existente') {
          targetProjectId = projectId
          const project = (projectsForClient.data ?? []).find((p) => p.id === projectId)
          projectName = project?.name ?? 'Projeto sem nome'
          const g = project?.publicLink
          setGalleryLink(g ? `${window.location.origin}/g/${g}` : null)
        } else {
          const created = await projectService.create({ name: title.trim(), clientId })
          targetProjectId = created.id
          projectName = created.name
          setGalleryLink(
            created.publicLink ? `${window.location.origin}/g/${created.publicLink}` : null,
          )
        }
        setBatchProjectId(targetProjectId)
      }

      // A demanda representa a entrega, não cada arquivo: 10 vídeos enviados
      // juntos continuam aparecendo como apenas um card no Kanban.
      await createBatchDemand(projectName || 'Novo lote')
      await uploadPending(targetProjectId)
      setPhase('done')
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Falha ao criar o projeto.')
      setPhase('idle')
    }
  }

  async function retryFailed() {
    if (!batchProjectId) return
    setPhase('submitting')
    await uploadPending(batchProjectId)
    setPhase('done')
  }

  async function copyLink() {
    if (!galleryLink) return
    try {
      await navigator.clipboard.writeText(galleryLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function reset() {
    setItems([])
    setFileError(null)
    setTitle('')
    // Com projeto travado (veio de "Novo vídeo" dentro de um projeto), o
    // próximo lote continua indo pro mesmo projeto — só o form de arquivos
    // reseta, não a trava de cliente/projeto/editor.
    if (!prefilledProject) {
      setClientId('')
      setProjectMode('novo')
      setProjectId('')
      setEditorId('')
    }
    setDeadline('')
    setFieldErrors({})
    setPhase('idle')
    setSubmitError(null)
    setBatchProjectId(null)
    setBatchDemandId(null)
    setGalleryLink(null)
  }

  const busy = phase === 'submitting'
  const doneCount = items.filter((i) => i.status === 'done').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const uploadingItem = items.find((i) => i.status === 'uploading')
  const overallPercent = items.length
    ? Math.round(((doneCount + (uploadingItem?.progress ?? 0) / 100) / items.length) * 100)
    : 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">ENVIAR VÍDEOS</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Suba os arquivos, identifique o projeto e gere um link para o cliente.
      </p>

      {/* Sucesso / resumo do lote */}
      {phase === 'done' ? (
        <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/10 p-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
            <Check className="size-7" />
          </span>
          <p className="mt-3 font-display text-2xl tracking-wide">
            {errorCount > 0
              ? `${doneCount} DE ${items.length} VÍDEOS ENVIADOS`
              : items.length > 1
                ? `${items.length} VÍDEOS ENVIADOS!`
                : 'VÍDEO ENVIADO!'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {errorCount > 0
              ? 'Alguns vídeos falharam — veja abaixo e tente novamente.'
              : galleryLink
                ? 'Compartilhe o link abaixo com seu cliente para aprovação.'
                : 'Vídeos registrados com sucesso.'}
          </p>

          <ul className="mt-4 flex flex-col gap-2 text-left">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/50 p-3"
              >
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-lg',
                    item.status === 'done'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-destructive/15 text-destructive',
                  )}
                >
                  {item.status === 'done' ? (
                    <Check className="size-4" />
                  ) : (
                    <AlertTriangle className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground" title={item.name}>
                    {item.name}
                  </p>
                  {item.error && <p className="text-xs text-destructive">{item.error}</p>}
                </div>
              </li>
            ))}
          </ul>

          {galleryLink && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 truncate rounded-lg bg-background px-3 py-2.5 text-left text-sm text-primary">
                {galleryLink}
              </code>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90"
              >
                {copied ? (
                  <>
                    <Check className="size-4" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="size-4" /> Copiar
                  </>
                )}
              </button>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {errorCount > 0 && (
              <button
                type="button"
                onClick={retryFailed}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <RotateCcw className="size-4" /> Tentar novamente ({errorCount})
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
            >
              <Plus className="size-4" /> Enviar outro lote
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busy) addFiles(e.dataTransfer.files)
            }}
            onClick={() => {
              if (busy || selecting) return
              setSelecting(true)
              inputRef.current?.click()
            }}
            className={cn(
              'mt-6 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors',
              items.length > 0 ? 'p-6' : 'p-10',
              busy || selecting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
              fileError
                ? 'border-destructive/60 bg-destructive/5'
                : dragging
                  ? 'border-primary bg-primary/10'
                  : 'border-primary/50 bg-card hover:border-primary hover:bg-primary/5',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {selecting ? (
              <>
                <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
                  <Loader2 className="size-7 animate-spin" />
                </span>
                <p className="mt-3 font-display text-2xl tracking-wide">PROCESSANDO SELEÇÃO…</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Isso pode levar alguns segundos com vídeos grandes ou salvos no iCloud.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelecting(false)
                  }}
                  className="mt-3 text-sm text-muted-foreground underline hover:text-foreground"
                >
                  Cancelar
                </button>
              </>
            ) : items.length === 0 ? (
              <>
                <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
                  <UploadCloud className="size-7" />
                </span>
                <p className="mt-3 font-display text-2xl tracking-wide">ARRASTE OS VÍDEOS AQUI</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  ou clique para selecionar (pode escolher vários) — {UPLOAD_ACCEPTED_LABEL}
                </p>
              </>
            ) : (
              <>
                <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
                  <Plus className="size-5" />
                </span>
                <p className="mt-2 text-sm font-medium text-foreground">
                  Solte mais vídeos aqui, ou clique para adicionar
                </p>
              </>
            )}
          </div>
          {fileError && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" /> {fileError}
            </p>
          )}

          {/* Lista de arquivos selecionados */}
          {items.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <VideoThumbnail item={item} />
                  <div className="min-w-0 flex-1">
                    {item.status === 'pending' ? (
                      <input
                        value={item.name}
                        onChange={(e) => updateItem(item.id, { name: e.target.value })}
                        aria-label={`Nome do vídeo (${item.file.name})`}
                        placeholder={item.file.name}
                        className="min-h-8 w-full rounded-md border border-transparent bg-transparent px-1 -mx-1 text-sm font-medium text-foreground outline-none hover:border-border focus:border-primary focus:bg-secondary"
                      />
                    ) : (
                      <p className="truncate text-sm font-medium text-foreground" title={item.name}>
                        {item.name}
                      </p>
                    )}
                    {item.status === 'error' ? (
                      <p className="truncate text-xs text-destructive">{item.error}</p>
                    ) : item.status === 'uploading' ? (
                      <>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-200"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        {!!item.speedBps && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatSpeed(item.speedBps)}
                            {item.etaSeconds != null && ` · ${formatEta(item.etaSeconds)}`}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    )}
                  </div>
                  {!busy && item.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remover ${item.file.name}`}
                      className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Form */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {prefillLoading ? (
              <div className="sm:col-span-2">
                <Skeleton className="h-11 w-full" />
              </div>
            ) : prefilledProject ? (
              // Veio do botão "Novo vídeo" dentro de um projeto: cliente e
              // projeto ficam travados nesse projeto específico — não dá pra
              // trocar de cliente, criar um novo, nem escolher outro projeto
              // por aqui (evita mandar o vídeo pro lugar errado por engano).
              <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-foreground">Enviando para</span>
                <div className="rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground">
                  <span className="font-medium">{prefilledProject.name}</span>
                  {prefilledProject.client?.name && (
                    <span className="text-muted-foreground"> · {prefilledProject.client.name}</span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex items-center justify-between text-sm font-medium text-foreground">
                    Cliente
                    {newClient === null ? (
                      <button
                        type="button"
                        onClick={() => setNewClient('')}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="size-3" /> Novo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNewClient(null)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" /> Cancelar
                      </button>
                    )}
                  </span>

                  {newClient === null ? (
                    <select
                      value={clientId}
                      onChange={(e) => {
                        setClientId(e.target.value)
                        setProjectId('')
                      }}
                      disabled={busy || clients.loading}
                      aria-invalid={!!fieldErrors.client}
                      className={cn(
                        'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60',
                        fieldErrors.client ? 'border-destructive' : 'border-border',
                      )}
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
                    // Sempre em coluna: essa linha vive dentro de metade da grid
                    // (Cliente/Projeto lado a lado), então virar `flex-row` num
                    // breakpoint pensado pra largura total estourava a coluna e
                    // vazava por cima do campo "Projeto" ao lado.
                    <div className="flex flex-col gap-2">
                      <input
                        value={newClient}
                        onChange={(e) => setNewClient(e.target.value)}
                        placeholder="Nome do cliente"
                        className="min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={createClient}
                        disabled={creatingClient || !newClient.trim()}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                      >
                        {creatingClient ? <Loader2 className="size-4 animate-spin" /> : 'Salvar'}
                      </button>
                    </div>
                  )}
                  {fieldErrors.client && (
                    <span className="text-xs text-destructive">{fieldErrors.client}</span>
                  )}
                  {clients.error && (
                    <span className="text-xs text-destructive">
                      Falha ao carregar clientes.{' '}
                      <button type="button" onClick={clients.refetch} className="underline">
                        Tentar de novo
                      </button>
                    </span>
                  )}
                </label>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Projeto</span>
                  <div className="flex gap-1 rounded-lg bg-secondary p-1">
                    <button
                      type="button"
                      onClick={() => setProjectMode('novo')}
                      disabled={busy}
                      className={cn(
                        'min-h-9 flex-1 rounded-md text-sm font-medium transition-colors disabled:opacity-60',
                        projectMode === 'novo'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Novo projeto
                    </button>
                    <button
                      type="button"
                      onClick={() => setProjectMode('existente')}
                      disabled={busy}
                      className={cn(
                        'min-h-9 flex-1 rounded-md text-sm font-medium transition-colors disabled:opacity-60',
                        projectMode === 'existente'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Projeto existente
                    </button>
                  </div>

                  {projectMode === 'novo' ? (
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={busy}
                      placeholder="Ex: Reel lançamento batom"
                      aria-invalid={!!fieldErrors.title}
                      className={cn(
                        'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60',
                        fieldErrors.title ? 'border-destructive' : 'border-border',
                      )}
                    />
                  ) : !clientId ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                      Selecione um cliente para ver os projetos dele.
                    </p>
                  ) : projectsForClient.loading ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                      Carregando projetos…
                    </p>
                  ) : (projectsForClient.data ?? []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                      Esse cliente ainda não tem nenhum projeto. Use &quot;Novo projeto&quot;.
                    </p>
                  ) : (
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={busy}
                      aria-invalid={!!fieldErrors.project}
                      className={cn(
                        'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60',
                        fieldErrors.project ? 'border-destructive' : 'border-border',
                      )}
                    >
                      <option value="" disabled>
                        Selecione o projeto
                      </option>
                      {(projectsForClient.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {fieldErrors.title && projectMode === 'novo' && (
                    <span className="text-xs text-destructive">{fieldErrors.title}</span>
                  )}
                  {fieldErrors.project && projectMode === 'existente' && (
                    <span className="text-xs text-destructive">{fieldErrors.project}</span>
                  )}
                </div>
              </>
            )}

            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">
                Prazo de entrega <span className="font-normal text-muted-foreground">(opcional)</span>
              </span>
              <DateField
                value={deadline}
                onChange={setDeadline}
                disabled={busy}
                min={new Date().toISOString().slice(0, 10)}
                clearable
              />
              <span className="text-xs text-muted-foreground">
                Aplicado a todos os vídeos deste lote.
              </span>
            </label>

            {assignableMembers.length > 0 && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  Editor responsável <span className="font-normal text-muted-foreground">(opcional)</span>
                </span>
                <select
                  value={editorId}
                  onChange={(e) => setEditorId(e.target.value)}
                  disabled={busy}
                  className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
                >
                  <option value="">Sem editor responsável</option>
                  {assignableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Atribuído a todos os vídeos deste lote.
                </span>
              </label>
            )}
          </div>

          {/* Progresso do lote */}
          {busy && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Enviando {Math.min(doneCount + 1, items.length)} de {items.length} vídeos…
                </span>
                <span className="tabular-nums text-muted-foreground">{overallPercent}%</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Pode navegar para outras páginas enquanto isso — o envio continua em segundo
                plano. Só evite fechar esta aba ou o navegador antes de terminar.
              </p>
            </div>
          )}

          {/* Erro de submit */}
          {submitError && !busy && (
            <p className="mt-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" /> {submitError}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 font-display text-xl tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? (
              <>
                <Loader2 className="size-5 animate-spin" /> ENVIANDO…
              </>
            ) : (
              <>
                <Link2 className="size-5" />
                {items.length > 1 ? `ENVIAR ${items.length} VÍDEOS` : 'GERAR LINK DE COMPARTILHAMENTO'}
              </>
            )}
          </button>
        </>
      )}
    </div>
  )
}
