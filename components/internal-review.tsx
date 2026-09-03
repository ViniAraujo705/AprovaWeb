'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Lock,
  MessageSquarePlus,
  CornerDownRight,
  Loader2,
  Check,
  ExternalLink,
  Download,
  AlertTriangle,
  UploadCloud,
  History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Comment, CommentThread, Video } from '@/lib/types'
import { clientChannelService, internalCommentService, videoService } from '@/lib/services'
import { useQuery } from '@/lib/use-query'
import { useAuth } from '@/components/auth-provider'
import { ApiError } from '@/lib/api'
import { formatDuration, formatSentAt } from '@/lib/format'
import { triggerDownload } from '@/lib/download'
import { validateVideoFile, uploadToPresignedUrl, UploadError, resolveContentType } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { LoadingState, ErrorState } from '@/components/states'
import { FadeIn, motion, AnimatePresence } from '@/components/motion'
import { VideoStage, type VideoStageHandle, type StageMarker } from '@/components/video-stage'
import { RoleBadge } from '@/components/comment-items'
import { DeadlineBadge, DeadlineField } from '@/components/deadline-badge'
import { VideoTitleField } from '@/components/video-title-field'
import { toast } from '@/lib/toast'

interface InternalData {
  video: Video
  comments: Comment[]
  clientComments: Comment[]
}

/** Agrupa comentários em threads: raízes (parentId null) + suas respostas. */
function buildThreads(comments: Comment[]): CommentThread[] {
  const ids = new Set(comments.map((c) => c.id))
  // Um parentId que não existe nesta lista (ex: comentário movido de outro
  // vídeo, cujo pai ficou para trás) não pode formar uma resposta órfã —
  // tratamos como raiz pra garantir que o comentário sempre apareça.
  const isRoot = (c: Comment) => !c.parentId || !ids.has(c.parentId)
  const roots = comments.filter(isRoot).sort((a, b) => a.timestamp - b.timestamp)
  const byParent = new Map<string, Comment[]>()
  for (const c of comments) {
    if (isRoot(c)) continue
    const arr = byParent.get(c.parentId!) ?? []
    arr.push(c)
    byParent.set(c.parentId!, arr)
  }
  return roots.map((comment) => ({
    comment,
    replies: (byParent.get(comment.id) ?? []).sort(
      (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    ),
  }))
}

export function InternalReview({ videoId }: { videoId: string }) {
  const stageRef = useRef<VideoStageHandle>(null)
  const [current, setCurrent] = useState(0)
  // Enquanto uma nova versão está subindo, o refetch-on-focus fica desligado:
  // um alt-tab no meio do upload não pode trocar `data` (e o player) embaixo
  // do upload em andamento.
  const [uploadingVersion, setUploadingVersion] = useState(false)
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'

  const { data, loading, error, refetch, setData } = useQuery<InternalData>(
    async (signal) => {
      const [video, comments, clientChannel] = await Promise.all([
        videoService.get(videoId, signal),
        internalCommentService.list(videoId, signal),
        clientChannelService.get(videoId, signal),
      ])
      return {
        video,
        comments,
        // Comentários e áudios do cliente são espelhados aqui automaticamente.
        // Respostas da agência continuam no canal público e notas internas nunca
        // voltam para o cliente.
        clientComments: clientChannel.comments.filter((comment) => comment.authorRole === 'client'),
      }
    },
    [videoId],
    { refetchOnFocus: !uploadingVersion, staleAfterMs: 5_000 },
  )

  function seek(t: number) {
    stageRef.current?.seek(t)
  }

  function appendComment(created: Comment) {
    setData((prev) =>
      prev ? { ...prev, comments: [...prev.comments, created] } : (prev as unknown as InternalData),
    )
  }

  function updateDeadline(deadline: string | null) {
    setData((prev) =>
      prev ? { ...prev, video: { ...prev.video, deadline } } : (prev as unknown as InternalData),
    )
  }

  function updateTitle(title: string) {
    setData((prev) =>
      prev ? { ...prev, video: { ...prev.video, title } } : (prev as unknown as InternalData),
    )
  }

  // Só troca a tela inteira por spinner/erro enquanto ainda não há nada para
  // mostrar. Um refetch em segundo plano (`refetchOnFocus`) NÃO pode desmontar
  // o conteúdo: ao escolher um arquivo em "Enviar nova versão", o Chrome dispara
  // o `focus` da janela ANTES do `change` do input; se o refetch trocasse a tela
  // pelo spinner nesse intervalo, o <input type="file"> saía do DOM e o `change`
  // nunca chegava no React — o upload não começava e a tela só "piscava".
  if (!data) {
    if (error) {
      return (
        <div className="px-4 py-10 sm:px-6 lg:px-10">
          <ErrorState message={error} onRetry={refetch} />
        </div>
      )
    }
    if (loading) {
      return (
        <div className="grid min-h-[60vh] place-items-center">
          <LoadingState label="Carregando revisão interna…" />
        </div>
      )
    }
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-10">
        <ErrorState message="Vídeo não encontrado." onRetry={refetch} />
      </div>
    )
  }

  const { video, comments, clientComments } = data
  const isSuperseded = video.latestVersionId !== video.id
  const threads = buildThreads(comments)
  const markers: StageMarker[] = [...comments, ...clientComments]
    .filter((c) => !c.parentId)
    .map((c) => ({ id: c.id, timestamp: c.timestamp, label: c.text }))

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      {/* Cabeçalho: indicador claro de que esta tela é o canal interno */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 font-display text-sm tracking-wide text-primary-foreground">
            <Lock className="size-3.5" />
            REVISÃO INTERNA
          </span>
          <span className="text-xs text-muted-foreground">
            Visível apenas para a equipe da agência — o cliente não vê esta tela.
          </span>
        </div>
        {isSuperseded && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <History className="size-3.5 shrink-0" />
            Esta é uma versão antiga deste vídeo.{' '}
            <Link href={`/videos/${video.latestVersionId}/revisao`} className="font-medium underline">
              Ver a versão mais recente
            </Link>
          </div>
        )}
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {video.type} · {video.clientName || 'Cliente'}
            </p>
            {isOwner ? (
              <VideoTitleField
                title={video.title}
                onSave={async (title) => {
                  const updated = await videoService.updateTitle(videoId, title)
                  updateTitle(updated.title)
                }}
                className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              />
            ) : (
              <h1
                className="mt-1 truncate text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
                title={video.title}
              >
                {video.title}
              </h1>
            )}
            {/* Prazo de entrega: owner define, editor só visualiza. */}
            <div className="mt-2">
              {isOwner ? (
                <DeadlineField videoId={videoId} deadline={video.deadline} onUpdated={updateDeadline} />
              ) : (
                <DeadlineBadge deadline={video.deadline} />
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <DownloadOriginalButton videoId={videoId} />
            {!isSuperseded && (
              <NewVersionButton
                videoId={videoId}
                projectId={video.projectId}
                title={video.title}
                onUploadingChange={setUploadingVersion}
              />
            )}
            {video.publicLink && (
              <Link
                href={`/videos/${videoId}/canal-cliente`}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
              >
                <ExternalLink className="size-3.5" />
                Ver canal do cliente
              </Link>
            )}
          </div>
        </div>
      </div>

      {video.status === 'ajuste' && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          O cliente solicitou ajustes. Os comentários dele aparecem abaixo automaticamente.
        </div>
      )}

      <FadeIn className="mt-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-6">
        {/* Player / timeline reaproveitados (sem botões de aprovação) */}
        <div className="lg:min-w-0">
          <VideoStage ref={stageRef} video={video} markers={markers} onCurrentChange={setCurrent} />
        </div>

        {/* Thread de comentários internos */}
        <div className="mt-6 lg:mt-0">
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <h2 className="font-display text-2xl tracking-wide">AJUSTES DO CLIENTE ({clientComments.length})</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sincronizados com o canal do cliente; ficam visíveis nos dois lugares.
            </p>
            {clientComments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nenhum ajuste enviado pelo cliente ainda.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {clientComments.map((comment) => (
                  <li key={comment.id} className="rounded-lg border border-border bg-card p-3">
                    <CommentBody comment={comment} onSeek={seek} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <InternalComposer
            videoId={videoId}
            timestamp={Math.round(current)}
            onCreated={appendComment}
          />

          <h2 className="mt-6 font-display text-2xl tracking-wide">
            DISCUSSÃO INTERNA ({comments.length})
          </h2>
          {threads.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nenhum comentário interno ainda. Combine ajustes com a equipe antes de enviar ao
              cliente.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {threads.map((t) => (
                <ThreadItem
                  key={t.comment.id}
                  thread={t}
                  videoId={videoId}
                  onSeek={seek}
                  onReplyCreated={appendComment}
                />
              ))}
            </ul>
          )}
        </div>
      </FadeIn>
    </div>
  )
}

/** Composer principal de comentário interno (no ponto atual do vídeo). */
function InternalComposer({
  videoId,
  timestamp,
  onCreated,
}: {
  videoId: string
  timestamp: number
  onCreated: (c: Comment) => void
}) {
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit() {
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setError(null)
    try {
      const created = await internalCommentService.add(videoId, { text, timestamp })
      onCreated(created)
      setDraft('')
      setSent(true)
      toast.success('Comentário adicionado')
      setTimeout(() => setSent(false), 1800)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquarePlus className="size-4 text-primary" />
        Comentar em {formatDuration(timestamp)}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Anote um ajuste ou observação para a equipe…"
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!draft.trim() || posting}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {posting && <Loader2 className="size-4 animate-spin" />}
        COMENTAR INTERNAMENTE
      </button>
      <AnimatePresence>
        {sent && (
          <motion.p
            initial={{ y: -4 }}
            animate={{ y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-400"
          >
            <Check className="size-4" /> Comentário enviado
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Comentário raiz + respostas indentadas + composer de resposta inline. */
function ThreadItem({
  thread,
  videoId,
  onSeek,
  onReplyCreated,
}: {
  thread: CommentThread
  videoId: string
  onSeek: (t: number) => void
  onReplyCreated: (c: Comment) => void
}) {
  const { comment, replies } = thread
  const [replying, setReplying] = useState(false)

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <CommentBody comment={comment} onSeek={onSeek} />

      {/* Respostas (indentadas) */}
      {replies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3 border-l-2 border-primary/25 pl-3">
          {replies.map((r) => (
            <li key={r.id}>
              <CommentBody comment={r} onSeek={onSeek} isReply />
            </li>
          ))}
        </ul>
      )}

      {/* Ação/campo de resposta */}
      <div className="mt-2 pl-1">
        {replying ? (
          <ReplyComposer
            videoId={videoId}
            parentId={comment.id}
            timestamp={comment.timestamp}
            onCreated={(c) => {
              onReplyCreated(c)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
          >
            <CornerDownRight className="size-3.5" />
            Responder
          </button>
        )}
      </div>
    </li>
  )
}

/** Corpo de um comentário: badge de papel + autor + timestamp + texto. */
function CommentBody({
  comment,
  onSeek,
  isReply,
}: {
  comment: Comment
  onSeek: (t: number) => void
  isReply?: boolean
}) {
  return (
    <div className={cn('flex gap-3', isReply && 'text-sm')}>
      <button
        type="button"
        onClick={() => onSeek(comment.timestamp)}
        className="h-fit shrink-0 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary"
      >
        {formatDuration(comment.timestamp)}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{comment.author || 'Equipe'}</span>
          {comment.authorRole && <RoleBadge role={comment.authorRole} />}
          {comment.createdAt && (
            <span className="text-xs text-muted-foreground">{formatSentAt(comment.createdAt)}</span>
          )}
        </div>
        {comment.text && <p className="mt-0.5 text-sm text-muted-foreground">{comment.text}</p>}
        {comment.audioUrl && (
          <audio controls src={comment.audioUrl} className="mt-1.5 h-9 w-full max-w-full" />
        )}
      </div>
    </div>
  )
}

/** Composer inline para responder dentro de uma thread. */
function ReplyComposer({
  videoId,
  parentId,
  timestamp,
  onCreated,
  onCancel,
}: {
  videoId: string
  parentId: string
  timestamp: number
  onCreated: (c: Comment) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const text = draft.trim()
    if (!text) return
    setPosting(true)
    setError(null)
    try {
      const created = await internalCommentService.add(videoId, { text, timestamp, parentId })
      onCreated(created)
      toast.success('Resposta enviada')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível responder.')
      setPosting(false)
    }
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Escreva uma resposta…"
        rows={2}
        autoFocus
        className="w-full resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || posting}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {posting && <Loader2 className="size-3.5 animate-spin" />}
          Responder
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={posting}
          className="inline-flex min-h-9 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Baixa o arquivo original (fora da versão otimizada) — owner e editor da mesma conta. */
function DownloadOriginalButton({ videoId }: { videoId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const { url, filename } = await videoService.getDownloadOriginalUrl(videoId)
      triggerDownload(url, filename)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível baixar o original.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        Baixar original
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}

/**
 * Sobe uma nova versão vinculada a este vídeo (ex.: correção pedida pelo
 * cliente). Ao concluir, a própria revisão interna abre automaticamente a
 * nova versão, para a equipe não continuar olhando o arquivo anterior.
 *
 * `title` é o título do vídeo atual: nova versão troca só o ARQUIVO, o nome
 * do vídeo é pra continuar o mesmo (ver `restoreTitle` abaixo).
 */
function NewVersionButton({
  videoId,
  projectId,
  title,
  onUploadingChange,
}: {
  videoId: string
  projectId: string | null
  title: string
  onUploadingChange: (uploading: boolean) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<'idle' | 'uploading'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  /** Mantém a tela pai avisada: ela pausa o refetch-on-focus durante o upload. */
  function startUploading(uploading: boolean) {
    setPhase(uploading ? 'uploading' : 'idle')
    onUploadingChange(uploading)
  }

  async function handleFile(file: File) {
    const validationError = validateVideoFile(file)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    startUploading(true)
    setProgress(0)
    try {
      // Modo demo: simula o upload sem tocar no backend/R2 — getUploadUrl()
      // e uploadToPresignedUrl() fariam uma chamada de rede real mesmo em
      // modo demo (não têm branch de demo, ao contrário de newVersion()).
      let urlStorage = ''
      if (isDemo()) {
        for (let p = 20; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 80))
          setProgress(p)
        }
      } else {
        const presigned = await videoService.getUploadUrl({
          fileName: file.name,
          contentType: resolveContentType(file),
        })
        if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
        if (!presigned.publicUrl)
          throw new UploadError('Servidor não retornou a URL pública do arquivo.')

        await uploadToPresignedUrl({
          url: presigned.uploadUrl,
          file,
          headers: presigned.headers,
          onProgress: setProgress,
        })
        urlStorage = presigned.publicUrl
      }

      const created = await videoService.newVersion(videoId, {
        urlStorage,
        nomeArquivo: file.name,
      })
      // O backend batiza a nova versão com o nome do ARQUIVO enviado (mesma
      // regra do upload inicial), mas aqui só o arquivo mudou — o vídeo
      // continua sendo o mesmo, então o nome tem que continuar o mesmo.
      // Restauramos o título original quando o backend o trocou. Se essa
      // chamada falhar, não vale derrubar o upload (que já deu certo): a
      // versão fica no ar com o nome do arquivo e dá pra renomear na mão.
      let final = created
      if (created.title !== title) {
        try {
          final = await videoService.updateTitle(created.id, title)
        } catch {
          // segue com o título que o backend deu
        }
      }
      // A resposta de `new-version` deveria conter a linha filha recém-criada,
      // mas confirmamos pela lista do projeto antes de navegar. Isso evita
      // reabrir o vídeo antigo se o endpoint retornar o registro pai por
      // engano durante uma atualização do backend.
      let newVersionId = final.id
      // A revisão antiga nem sempre traz projectId. Nesse caso aproveitamos o
      // ID do projeto vindo na resposta da nova versão; se ambos faltarem,
      // consultamos a lista da conta para não cair no registro pai.
      const versionProjectId = projectId ?? final.projectId
      for (let attempt = 0; attempt < 3; attempt++) {
        const projectVideos = await videoService.list(versionProjectId ?? undefined)
        const child = projectVideos
          .filter((candidate) => candidate.videoPaiId === videoId)
          .sort((a, b) => b.version - a.version)[0]
        if (child) {
          newVersionId = child.id
          break
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (!newVersionId || newVersionId === videoId) {
        throw new Error('O servidor não retornou uma nova versão do vídeo. Tente novamente em instantes.')
      }
      toast.success('Nova versão enviada', 'Abrindo a nova versão…')
      // Navegação completa em vez da troca client-side do App Router: garante
      // que o player e todos os dados sejam buscados novamente para o ID novo,
      // sem reutilizar o estado/mídia da revisão anterior.
      window.location.assign(`/videos/${newVersionId}/revisao`)
    } catch (err) {
      const message =
        err instanceof UploadError
          ? err.message
          : err instanceof ApiError
            ? err.message
            : 'Falha ao enviar a nova versão.'
      setError(message)
      startUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={phase === 'uploading'}
        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
      >
        {phase === 'uploading' ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Enviando… {progress}%
          </>
        ) : (
          <>
            <UploadCloud className="size-3.5" /> Enviar nova versão
          </>
        )}
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}
