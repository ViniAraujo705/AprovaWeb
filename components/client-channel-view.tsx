'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Reply, Users, Loader2, Check, Lock, FolderInput } from 'lucide-react'
import type { Comment, PublicVideo, TeamMember, Video } from '@/lib/types'
import { isAgencyAuthor } from '@/lib/types'
import { clientChannelService, teamService, videoService } from '@/lib/services'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { LoadingState, ErrorState } from '@/components/states'
import { FadeIn, motion, AnimatePresence } from '@/components/motion'
import { VideoStage, type VideoStageHandle, type StageMarker } from '@/components/video-stage'
import { AgencyReplyItem, DraggableClientCommentItem } from '@/components/comment-items'
import { toast } from '@/lib/toast'

export function ClientChannelView({ videoId }: { videoId: string }) {
  const stageRef = useRef<VideoStageHandle>(null)
  const [current, setCurrent] = useState(0)

  const { data, loading, error, refetch, setData } = useQuery<PublicVideo>(
    (signal) => clientChannelService.get(videoId, signal),
    [videoId],
  )

  const [movingComment, setMovingComment] = useState<Comment | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const comments = data?.comments ?? []
  const sorted = useMemo(
    () => [...comments].sort((a, b) => a.timestamp - b.timestamp),
    [comments],
  )
  const markers: StageMarker[] = useMemo(
    () => sorted.map((c) => ({ id: c.id, timestamp: c.timestamp, label: c.text })),
    [sorted],
  )

  function seek(t: number) {
    stageRef.current?.seek(t)
  }

  function appendReply(created: Comment) {
    setData((prev) =>
      prev ? { ...prev, comments: [...prev.comments, created] } : (prev as unknown as PublicVideo),
    )
  }

  function removeCommentLocally(commentId: string) {
    setData((prev) =>
      prev
        ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
        : (prev as unknown as PublicVideo),
    )
  }

  async function deleteComment(comment: Comment) {
    setDeletingId(comment.id)
    setActionError(null)
    try {
      await clientChannelService.remove(videoId, comment.id)
      removeCommentLocally(comment.id)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível excluir o comentário.')
    } finally {
      setDeletingId(null)
    }
  }

  function handleMoved(commentId: string) {
    removeCommentLocally(commentId)
    setMovingComment(null)
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <LoadingState label="Carregando canal do cliente…" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-10">
        <ErrorState message={error ?? 'Vídeo não encontrado.'} onRetry={refetch} />
      </div>
    )
  }

  const { video } = data

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-display text-sm tracking-wide text-foreground ring-1 ring-border">
            <Users className="size-3.5" />
            CANAL DO CLIENTE
          </span>
          <span className="text-xs text-muted-foreground">
            Você está vendo o que o cliente vê. Suas respostas aparecem para ele.
          </span>
        </div>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {video.type} · {video.clientName || 'Cliente'}
            </p>
            <h1
              className="mt-1 truncate text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              title={video.title}
            >
              {video.title}
            </h1>
          </div>
          <Link
            href={`/videos/${videoId}/revisao`}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-medium text-primary hover:bg-primary/25"
          >
            <Lock className="size-3.5" />
            Ir para a revisão interna
          </Link>
        </div>
      </div>

      <FadeIn className="mt-6 lg:grid lg:grid-cols-[1fr_420px] lg:gap-6">
        <div className="lg:min-w-0">
          <VideoStage
            ref={stageRef}
            video={video}
            markers={markers}
            onCurrentChange={setCurrent}
            clientPhotoUrl={data.clientPhotoUrl}
            clientDescription={data.clientDescription}
          />
        </div>

        <div className="mt-6 lg:mt-0">
          {/* Composer de resposta da agência */}
          <ReplyComposer
            videoId={videoId}
            timestamp={Math.round(current)}
            onCreated={appendReply}
          />

          <h2 className="mt-6 font-display text-2xl tracking-wide">
            CONVERSA COM O CLIENTE ({sorted.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Arraste um comentário do cliente para o lado para movê-lo à revisão interna de outro
            vídeo ou excluí-lo.
          </p>
          {actionError && <p className="mt-2 text-xs text-destructive">{actionError}</p>}
          {sorted.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              O cliente ainda não comentou. Assim que houver comentários, você pode respondê-los
              por aqui.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {sorted.map((c) =>
                isAgencyAuthor(c.authorRole) ? (
                  <AgencyReplyItem key={c.id} comment={c} onSeek={seek} />
                ) : (
                  <DraggableClientCommentItem
                    key={c.id}
                    comment={c}
                    onSeek={seek}
                    onMove={() => setMovingComment(c)}
                    onDelete={() => deleteComment(c)}
                    deleting={deletingId === c.id}
                  />
                ),
              )}
            </ul>
          )}
        </div>
      </FadeIn>

      <AnimatePresence>
        {movingComment && (
          <MoveCommentModal
            comment={movingComment}
            currentVideoId={videoId}
            onClose={() => setMovingComment(null)}
            onMoved={handleMoved}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** Seletor do vídeo (do editor) para onde um comentário do cliente será movido. */
function MoveCommentModal({
  comment,
  currentVideoId,
  onClose,
  onMoved,
}: {
  comment: Comment
  currentVideoId: string
  onClose: () => void
  onMoved: (commentId: string) => void
}) {
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [error, setError] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([videoService.list(), teamService.members()])
      .then(([allVideos, allMembers]) => {
        if (cancelled) return
        setVideos(allVideos.filter((v) => v.id !== currentVideoId && v.editorId))
        setMembers(allMembers)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Não foi possível carregar os vídeos.',
          )
          setVideos([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentVideoId])

  async function move(target: Video) {
    setMovingId(target.id)
    setError(null)
    try {
      await clientChannelService.moveToInternal(currentVideoId, comment, target.id)
      onMoved(comment.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível mover o comentário.')
      setMovingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <FolderInput className="size-4 text-primary" />
          Mover comentário para a revisão interna
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Escolha o vídeo do editor onde este comentário deve aparecer.
        </p>
        <p className="mt-3 truncate rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
          &ldquo;{comment.text}&rdquo;
        </p>

        <div className="mt-3 max-h-64 overflow-y-auto">
          {!videos ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : videos.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum outro vídeo com editor responsável encontrado.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {videos.map((v) => {
                const editorName = members.find((m) => m.id === v.editorId)?.name || 'Editor'
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => move(v)}
                      disabled={movingId !== null}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate" title={v.title}>
                        {v.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        {editorName}
                        {movingId === v.id && <Loader2 className="size-3.5 animate-spin text-primary" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <button
          type="button"
          onClick={onClose}
          disabled={movingId !== null}
          className="mt-4 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
        >
          Cancelar
        </button>
      </motion.div>
    </div>
  )
}

function ReplyComposer({
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
      const created = await clientChannelService.reply(videoId, { text, timestamp })
      onCreated(created)
      setDraft('')
      setSent(true)
      toast.success('Resposta enviada ao cliente')
      setTimeout(() => setSent(false), 1800)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar a resposta.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Reply className="size-4 text-primary" />
        Responder ao cliente em {formatDuration(timestamp)}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Escreva uma resposta pública para o cliente…"
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
        RESPONDER COMO AGÊNCIA
      </button>
      <AnimatePresence>
        {sent && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-400"
          >
            <Check className="size-4" /> Resposta enviada ao cliente
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
